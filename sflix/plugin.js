(function() {
    const BASE_URL = "https://sflix.film";

    const commonHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9,id;q=0.8", // Header krusial untuk streaming site
        "Origin": BASE_URL,
        "Referer": BASE_URL + "/"
    };
    
	async function search(query, cb) {
	    try {
	        const url = `${BASE_URL}/wefeed-h5-bff/web/subject/search`;
	        const headers = {
	            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	            "Accept": "application/json, text/plain, */*",
	            "Content-Type": "application/json;charset=UTF-8",
	            "Origin": BASE_URL,
	            "Referer": `${BASE_URL}/`
	        };
	        const body = JSON.stringify({
	            keyword: query,
	            page: 1,
	            perPage: 0, // Wajib 0
	            subjectType: 0
	        });
	
	        let resData;
	        if (typeof http_post !== 'undefined') {
	            // Urutan standar SkyStream: url, headers, body
	            const res = await http_post(url, headers, body);
	            // Handle jika runtime sudah auto-parse atau masih string
	            resData = typeof res === 'string' ? JSON.parse(res) 
	                      : (res.body ? (typeof res.body === 'string' ? JSON.parse(res.body) : res.body) : res);
	        } else {
	            const res = await fetch(url, { method: 'POST', headers, body });
	            resData = await res.json();
	        }
	
	        const items = resData?.data?.items || [];
	        const results = items.map(item => new MultimediaItem({
	            title: item.title || "",
	            url: String(item.subjectId),
	            posterUrl: item.cover?.url || "",
	            type: item.subjectType === 1 ? "movie" : "series",
	            score: parseFloat(item.imdbRatingValue) || 0
	        }));
	
	        cb({ success: true, data: results });
	    } catch (e) {
	        cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message });
	    }
	}


    async function fetchGet(endpoint, extraHeaders = {}) {
        const url = BASE_URL + endpoint;
        const headers = { ...commonHeaders, ...extraHeaders };

        if (typeof http_get !== 'undefined') {
            const res = await http_get(url, headers);
            if (res && res.status === 200) return JSON.parse(res.body);
            throw new Error(`Error GET: ${res ? res.status : 'Unknown'}`);
        } else {
            const res = await fetch(url, { headers });
            return await res.json();
        }
    }

    async function fetchPost(endpoint, bodyObj) {
        const url = BASE_URL + endpoint;
        const headers = { ...commonHeaders, "Content-Type": "application/json" };
        const bodyStr = JSON.stringify(bodyObj);

        if (typeof http_post !== 'undefined') {
            const res = await http_post(url, bodyStr, headers);
            if (res && res.status === 200) return JSON.parse(res.body);
            throw new Error(`Error POST: ${res ? res.status : 'Unknown'}`);
        } else {
            const res = await fetch(url, { method: 'POST', headers, body: bodyStr });
            return await res.json();
        }
    }

    // 1. HOME PAGE (Semua Kategori)
    async function getHome(cb) {
        // Daftar kategori dari Sflix.kt
        const categories = [
            { id: "872031290915189720", name: "Trending" },
            { id: "6528093688173053896", name: "Indonesian Movie" },
            { id: "5283462032510044280", name: "Indonesian Drama" },
            { id: "997144265920760504", name: "Hollywood" },
            { id: "4380734070238626200", name: "K-Drama" },
            { id: "8617025562613270856", name: "Anime" },
            { id: "5848753831881965888", name: "Horror" },
            { id: "7132534597631837112", name: "Animation" }
            // Bisa tambah ID lain sesuai kebutuhan
        ];

        try {
            const homeData = {};

            // Kita pakai for...of agar request berjalan satu per satu (berurutan)
            // Ini untuk mencegah server Sflix nge-blokir kita kalau nembak banyak API sekaligus
            for (const cat of categories) {
                try {
                    const data = await fetchGet(`/wefeed-h5-bff/web/ranking-list/content?id=${cat.id}&page=1&perPage=12`);
                    
                    if (data && data.data && data.data.subjectList && data.data.subjectList.length > 0) {
                        homeData[cat.name] = data.data.subjectList.map(item => new MultimediaItem({
                            title: item.title,
                            url: item.subjectId,
                            posterUrl: item.cover?.url,
                            type: item.subjectType === 1 ? "movie" : "series",
                            score: parseFloat(item.imdbRatingValue) || 0
                        }));
                    }
                } catch (err) {
                    // Kalau 1 kategori gagal/kosong, skip dan lanjut ke kategori berikutnya
                    console.log(`Skip ${cat.name}`);
                }
            }

            cb({ success: true, data: homeData });
        } catch (e) {
            cb({ success: false, errorCode: "SITE_OFFLINE", message: e.message });
        }
    }




    // 3. LOAD DETAILS
    async function load(url, cb) {
        try {
            const data = await fetchGet(`/wefeed-h5-bff/web/subject/detail?subjectId=${url}`);
            const subject = data.data?.subject;
            const resource = data.data?.resource;

            if (!subject) return cb({ success: false, errorCode: "PARSE_ERROR" });

            const episodes = [];
            const isSeries = subject.subjectType === 2;

            if (isSeries && resource?.seasons) {
                resource.seasons.forEach(season => {
                    const eps = season.allEp 
                        ? season.allEp.split(',').map(Number) 
                        : Array.from({length: season.maxEp}, (_, i) => i + 1);
                        
                    eps.forEach(epNum => {
                        episodes.push(new Episode({
                            name: `Episode ${epNum}`,
                            url: JSON.stringify({ id: subject.subjectId, se: season.se, ep: epNum, path: subject.detailPath }),
                            season: season.se,
                            episode: epNum
                        }));
                    });
                });
            } else {
                episodes.push(new Episode({
                    name: "Movie",
                    url: JSON.stringify({ id: subject.subjectId, se: 0, ep: 0, path: subject.detailPath }),
                    season: 1,
                    episode: 1
                }));
            }

            cb({
                success: true, 
                data: new MultimediaItem({
                    title: subject.title,
                    url: subject.subjectId,
                    posterUrl: subject.cover?.url,
                    type: isSeries ? "series" : "movie",
                    year: subject.releaseDate ? parseInt(subject.releaseDate.split('-')[0]) : null,
                    description: subject.description,
                    score: parseFloat(subject.imdbRatingValue) || 0,
                    episodes: episodes
                })
            });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }
    
	// Helper: format quality (360 → 360p, 1080p → 1080p)
	function formatQuality(res) {
	    if (!res) return "Auto";
	    // Jika sudah ada suffix p/k, return as-is
	    if (/[pk]$/i.test(res)) return res;
	    // Tambah suffix 'p' untuk angka
	    return res + 'p';
	}
	
		// 4. LOAD STREAMS
	async function loadStreams(dataStr, cb) {
	    try {
	        const { id, se, ep, path } = JSON.parse(dataStr);
	        const refererUrl = `${BASE_URL}/spa/videoPlayPage/movies/${path}?id=${id}&type=/movie/detail&lang=en`;
	        
	        const data = await fetchGet(`/wefeed-h5-bff/web/subject/play?subjectId=${id}&se=${se}&ep=${ep}`, {
	            "Referer": refererUrl
	        });
	
	        if (!data || !data.data || !data.data.streams || data.data.streams.length === 0) {
	            return cb({ success: true, data: [] });
	        }
	        
	        // --- AMBIL SUBTITLE ---
	        let subtitles = [];
	        try {
	            const firstStream = data.data.streams[0];
	            if (firstStream && firstStream.id && firstStream.format) {
	                const captionData = await fetchGet(`/wefeed-h5-bff/web/subject/caption?format=${firstStream.format}&id=${firstStream.id}&subjectId=${id}`, {
	                    "Referer": refererUrl
	                });
	                
	                if (captionData && captionData.data && captionData.data.captions) {
	                    subtitles = captionData.data.captions.map(sub => ({
	                        url: sub.url,
	                        label: sub.lanName || sub.lan || "Unknown",
	                        lang: sub.lanName || sub.lan || "Unknown"
	                    })).filter(sub => sub.url); // Pastikan url valid
	                }
	            }
	        } catch (subErr) {
	            console.log("Error fetch subtitles: " + subErr.message);
	        }
	        // -----------------------

	        // Match Kotlin: reversed() + distinctBy { it.url }
	        const streams = data.data.streams
	            .reverse()
	            .filter((s, i, arr) => arr.findIndex(x => x.url === s.url) === i)
	            .map(s => {
	                const reso = formatQuality(s.resolutions);
	                return new StreamResult({
	                    url: s.url,
	                    quality: reso,
	                    source: reso,
	                    headers: { "Referer": `${BASE_URL}/` },
	                    subtitles: subtitles // Masukkan array subtitle ke sini
	                });
	            });
	
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
