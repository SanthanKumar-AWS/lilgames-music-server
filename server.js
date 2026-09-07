require("dotenv").config();

const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok",version:"v3.0" });
});

const axios = require("axios");

const AUDIUS_API = "https://api.audius.co";
app.use(express.static(path.join(__dirname, "public")));
app.get("/api/search", async (req, res) => {

    try {

        const query =
            String(req.query.q || "").trim();

        if (!query) {
            return res.status(400).json({
                error: "Search query required."
            });
        }

        const response = await axios.get(
            `${AUDIUS_API}/v1/tracks/search`,
            {
                params: {
                    query,
                    limit: 10
                }
            }
        );

        const tracks =
            (response.data.data || []).map(track => ({
                id: track.id,
                title: track.title,
                artist:
                    track.user?.name ||
                    track.user?.handle ||
                    "Unknown Artist",
                duration: track.duration,
                artwork:
                    track.artwork?.["150x150"] ||
                    track.artwork?.["480x480"] ||
                    null
            }));

        res.json({
            results: tracks
        });

    } catch (error) {

        console.error(
            "Audius search error:",
            error.message
        );

        res.status(500).json({
            error: "Unable to search music."
        });

    }

});

/*
=========================================
AUDIUS STREAM PROXY
=========================================
*/

app.get("/api/stream/:trackId", async (req, res) => {

    try {

        const trackId =
            String(req.params.trackId || "").trim();

        if (!trackId) {

            return res.status(400).json({
                error: "Track ID required."
            });

        }

        const headers = {};

        /*
         * Forward Range header from the browser.
         * HTML5 audio commonly requires this.
         */

        if (req.headers.range) {
            headers.Range = req.headers.range;
        }

        const response =
            await axios.get(
                `${AUDIUS_API}/v1/tracks/${encodeURIComponent(trackId)}/stream`,
                {
                    headers,
                    responseType: "stream",
                    maxRedirects: 5,
                    validateStatus: status =>
                        status >= 200 && status < 400
                }
            );

        /*
         * Preserve Audius response status.
         */

        res.status(response.status);

        /*
         * Forward important audio headers.
         */

        const headersToForward = [
            "content-type",
            "content-length",
            "content-range",
            "accept-ranges"
        ];

        headersToForward.forEach(name => {

            if (response.headers[name]) {

                res.setHeader(
                    name,
                    response.headers[name]
                );

            }

        });

        /*
         * Make the response cache-friendly enough
         * for normal browser audio playback.
         */

        res.setHeader(
            "Cache-Control",
            "no-cache"
        );

        response.data.on(
            "error",
            error => {

                console.error(
                    "Audius stream pipe error:",
                    error.message
                );

                if (!res.headersSent) {
                    res.status(500);
                }

                res.end();

            }
        );

        response.data.pipe(res);

    } catch (error) {

        console.error(
            "Audius stream error:",
            error.message
        );

        if (!res.headersSent) {

            res.status(500).json({
                error: "Unable to stream music."
            });

        } else {

            res.end();

        }

    }

});


/*
=========================================
START SERVER
=========================================
*/

server.listen(PORT, "0.0.0.0", () => {
    console.log(`LilGames Music Server running on port ${PORT}`);
});
