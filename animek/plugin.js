(function() {
    // API Base asli dari web kamu
    const API_BASE = "https://api.sansekai.my.id/api/anime";

    async function fetchJson(url) {
        if (typeof http_get !== 'undefined') {
            const res = await http_get(url, {});
            if (res && res.status === 200) return JSON.parse(res.body);
            throw new Error(`HTTP ${res ? res.status : 'Error'}`);
        } else {
            const res = await fetch(url);
            return await res.json();
        }
    }
    
    // 1. HOME PAGE
    async function getHome(cb) {
        try {
            const [dataRecommend, dataLatest, dataMovie] = await Promise.all([
                fetchJson(`${API_BASE}/recommended?page=1`).catch(() => []),
                fetchJson(`${API_BASE}/latest`).catch(() => []),
                fetchJson(`${API_BASE}/movie`).catch(() => [])
            ]);

            const mapItem = (item) => new MultimediaItem({
                title: item.judul,
                url: item.url,
                posterUrl: item.cover,
                type: (item.total_episode === "?" || item.lastch) ? "series" : "movie",
                status: item.status || item.lastch || "Unknown"
            });

            const homeData = {};
            
            const recList = dataRecommend?.data || dataRecommend;
            if (Array.isArray(recList) && recList.length > 0) {
                homeData["Trending"] = recList.map(mapItem); // WAJIB "Trending"
            }
            
            // Ekstrak data Latest
            const latestList = dataLatest?.data || dataLatest;
            if (Array.isArray(latestList) && latestList.length > 0) {
                homeData["Latest Update"] = latestList.map(mapItem);
            }
            
            // Ekstrak data Movie
            const movieList = dataMovie?.data || dataMovie;
            if (Array.isArray(movieList) && movieList.length > 0) {
                homeData["Movies"] = movieList.map(mapItem);
            }

            cb({ success: true, data: homeData });
        } catch (e) {
            cb({ success: false, errorCode: "SITE_OFFLINE", message: e.message });
        }
    }




    // 2. SEARCH
    async function search(query, cb) {
        try {
            const res = await fetchJson(`${API_BASE}/search?query=${encodeURIComponent(query)}`);
            // Sansekai API menaruh data di dalam res.data[0].result
            const results = res?.data?.[0]?.result || [];

            if (results.length === 0) {
                return cb({ success: true, data: [] });
            }

            const items = results.map(item => new MultimediaItem({
                title: item.judul,
                url: item.url,
                posterUrl: item.cover,
                type: (item.total_episode === "?" || item.lastch) ? "series" : "movie"
            }));

            cb({ success: true, data: items });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    // 3. LOAD DETAILS
    async function load(url, cb) {
        try {
            const res = await fetchJson(`${API_BASE}/detail?urlId=${url}`);
            const anime = res?.data?.[0];
            
            if (!anime) return cb({ success: false, errorCode: "PARSE_ERROR" });

            const chapters = anime.chapter || [];
            
            // Konversi list chapter ke format Episode SkyStream
            const episodes = chapters.map((ch, index) => {
                return new Episode({
                    // Mengambil judul dari object chapter
                    name: ch.judul || ch.title || `Episode ${chapters.length - index}`,
                    // Mengambil ID chapter untuk keperluan getvideo nanti
                    url: ch.url || ch.urlId || ch.id, 
                    episode: chapters.length - index
                });
            });

            // Bersihkan sinopsis dari teks promo
            const sinopsisBeres = anime.sinopsis 
                ? anime.sinopsis.replace(/Nonton Anime tanpa iklan di Aplikasi AnimeLovers V3/gi, '').trim() 
                : 'Tidak ada sinopsis.';

            cb({
                success: true,
                data: new MultimediaItem({
                    title: anime.judul,
                    url: url,
                    posterUrl: anime.cover,
                    type: "series",
                    description: sinopsisBeres,
                    episodes: episodes
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }
    
    // 4. LOAD STREAMS
    async function loadStreams(chapterUrlId, cb) {
        try {
            const streams = [];
            const resoList = ["1080p", "720p", "480p", "360p"];

            const requests = resoList.map(async (reso) => {
                try {
                    const resData = await fetchJson(`${API_BASE}/getvideo?chapterUrlId=${chapterUrlId}&reso=${reso}`);
                    const newStreams = resData?.data?.[0]?.stream || [];
                    
                    if (newStreams.length > 0 && newStreams[0].link) {
                        streams.push(new StreamResult({
                            url: newStreams[0].link,
                            quality: reso,
                            source: reso
                        }));
                    }
                } catch (err) {
                    // Abaikan jika error
                }
            });

            await Promise.all(requests);

            cb({ success: true, data: streams });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }




    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
