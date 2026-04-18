(function() {
    const USER_ID = "427115";
    const DEVICE_ID = "615d4ba5-d48e-4e45-a52f-8d5f991da44a";
    const PKG_NAME = "dev.animok.awet";
    const BUILD_NUM = "17";

    function toQueryString(obj) {
        return Object.keys(obj).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(obj[k])).join('&');
    }

    async function apiPost(url, body) {
        const headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Dart/3.10 (dart:io)',
            'Accept': 'application/json'
        };
        const bodyStr = toQueryString(body);

        let resBody = "";
        try {
            if (typeof http_post !== 'undefined') {
                const res = await http_post(url, headers, bodyStr);
                resBody = typeof res === 'string' ? res : (res.body || "");
            } else {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: headers,
                    body: bodyStr
                });
                resBody = await res.text();
            }
            return JSON.parse(resBody);
        } catch (e) {
            throw new Error(`Body: ${resBody.substring(0, 100)}... Error: ${e.message}`);
        }
    }

    function mapPoster(p) {
        return new MultimediaItem({
            title: p.title,
            url: String(p.id),
            posterUrl: p.image,
            type: p.type === "serie" ? "series" : (p.type || "movie")
        });
    }

    async function getHome(cb) {
        try {
            const json = await apiPost(`${manifest.baseUrl}/api/v2/content/home/`, {
                user_id: USER_ID,
                device_id: DEVICE_ID,
                packagename: PKG_NAME,
                buildnumber: BUILD_NUM
            });

            const result = {};

            if (json.slides && json.slides.length > 0) {
                result["Trending"] = json.slides.map(s => new MultimediaItem({
                    title: s.title === "POSTER_UMUM" ? s.poster.title : s.title,
                    url: String(s.poster.id),
                    posterUrl: s.poster.image,
                    type: s.poster.type === "serie" ? "series" : s.poster.type,
                    bannerUrl: s.imageDesktop || s.image,
                    description: s.description
                }));
            }

            if (json.list && json.list.length > 0) {
                json.list.forEach(cat => {
                    if (cat.title && cat.posters && cat.posters.length > 0) {
                        result[cat.title] = cat.posters.map(mapPoster);
                    }
                });
            }

            if (json.genres && json.genres.length > 0) {
                json.genres.forEach(genre => {
                    if (genre.title && genre.posters && genre.posters.length > 0) {
                        result[genre.title] = genre.posters.map(mapPoster);
                    }
                });
            }

            if (json.custom_lists && json.custom_lists.length > 0) {
                json.custom_lists.forEach(list => {
                    if (list.title && list.items && list.items.length > 0) {
                        result[list.title] = list.items.map(mapPoster);
                    }
                });
            }

            cb({ success: true, data: result });
        } catch (e) {
            cb({ success: false, errorCode: "PARSE_ERROR", message: e.message });
        }
    }

    async function search(query, cb) {
        try {
            const json = await apiPost(`${manifest.baseUrl}/api/v2/content/search/`, {
                q: query,
                user_id: USER_ID,
                page: "1",
                device_id: DEVICE_ID,
                packagename: PKG_NAME,
                buildnumber: BUILD_NUM
            });

            const results = (json || []).map(mapPoster);
            cb({ success: true, data: results });
        } catch (e) {
            cb({ success: false, errorCode: "SEARCH_ERROR", message: e.message });
        }
    }

    async function load(id, cb) {
        try {
            const detailsJson = await apiPost(`${manifest.baseUrl}/api/v2/content/details/`, {
                id: id,
                user_id: USER_ID,
                packagename: PKG_NAME,
                buildnumber: BUILD_NUM
            });

            const poster = detailsJson.data.poster;
            const item = new MultimediaItem({
                title: poster.title,
                url: String(poster.id),
                posterUrl: poster.poster_url,
                type: poster.type === "serie" ? "series" : poster.type,
                bannerUrl: poster.cover_url,
                description: poster.description,
                year: poster.year,
                status: (poster.label || "").toLowerCase().includes('ongoing') ? 'ongoing' : 'completed',
                score: poster.rating,
                tags: (detailsJson.data.genres || []).map(g => g.title),
                cast: (detailsJson.data.actors || []).map(a => new Actor({
                    name: a.name,
                    role: a.character,
                    image: a.photo_url
                }))
            });

            if (item.type === "series") {
                const seasons = detailsJson.data.seasons || [];
                const allEpisodes = [];

                for (let i = 0; i < seasons.length; i++) {
                    const season = seasons[i];
                    try {
                        const seasonJson = await apiPost(`${manifest.baseUrl}/api/v2/content/season/`, {
                            id: String(season.id),
                            user_id: USER_ID,
                            device_id: DEVICE_ID,
                            packagename: PKG_NAME,
                            buildnumber: BUILD_NUM
                        });

                        const episodes = (seasonJson.data || []).map((ep, index) => {
                            let playId = "";
                            if (ep.sources && ep.sources.length > 0 && ep.sources[0].url) {
                                const match = ep.sources[0].url.match(/[?&]id=(\d+)/);
                                if (match) playId = match[1];
                                else {
                                    const parts = ep.sources[0].url.split('=');
                                    playId = parts[parts.length - 1];
                                }
                            }
                            return new Episode({
                                name: ep.title,
                                url: JSON.stringify({ id: playId, episode_id: String(ep.id) }),
                                season: i + 1,
                                episode: index + 1
                            });
                        });
                        allEpisodes.push(...episodes);
                    } catch (err) {
                        console.error(`Failed to load season ${season.id}: ${err.message}`);
                    }
                }
                item.episodes = allEpisodes;
            } else {
                item.episodes = [new Episode({
                    name: poster.title,
                    url: JSON.stringify({ id: id, episode_id: id }),
                    season: 1,
                    episode: 1
                })];
            }

            cb({ success: true, data: item });
        } catch (e) {
            cb({ success: false, errorCode: "LOAD_ERROR", message: e.message });
        }
    }

    async function loadStreams(dataStr, cb) {
        try {
            const { id, episode_id } = JSON.parse(dataStr);
            const streamUrl = `https://anime.stream-api.my.id/stream/play.php?id=${id}&user_id=${USER_ID}&device_id=${DEVICE_ID}`;
            const json = await apiPost(streamUrl, {
                user_id: USER_ID,
                device_id: DEVICE_ID,
                package_name: PKG_NAME,
                episode_id: episode_id
            });

            const streams = [];
            const sources = json.Source || [];

            sources.forEach(source => {
                if (source.server && source.server.play) {
                    Object.keys(source.server.play).forEach(serverKey => {
                        const srv = source.server.play[serverKey];
                        if (srv.hd) {
                            const label = `${serverKey} HD (${srv.hd.size || ''})`.trim();
                            streams.push(new StreamResult({ 
                                url: srv.hd.url, 
                                quality: label,
                                source: label
                            }));
                        }
                        if (srv.sd) {
                            const label = `${serverKey} SD (${srv.sd.size || ''})`.trim();
                            streams.push(new StreamResult({ 
                                url: srv.sd.url, 
                                quality: label,
                                source: label
                            }));
                        }
                    });
                }
                if (source.alternatives) {
                    source.alternatives.forEach((alt, index) => {
                        const label = `Alternative ${index + 1}`;
                        streams.push(new StreamResult({ 
                            url: alt, 
                            quality: label,
                            source: label
                        }));
                    });
                }
            });

            cb({ success: true, data: streams });
        } catch (e) {
            cb({ success: false, errorCode: "STREAM_ERROR", message: e.message });
        }
    }

    globalThis.getHome = getHome;
    globalThis.search = search;
    globalThis.load = load;
    globalThis.loadStreams = loadStreams;
})();
