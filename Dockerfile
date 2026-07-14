# ─────────────────────────────────────────────
# Chained Together — Static Game Server
# Uses nginx:alpine (~8 MB) to serve HTML/JS/CSS
# Compatible with Render's Docker hosting.
# ─────────────────────────────────────────────

FROM nginx:alpine

# Remove the default nginx welcome page
RUN rm -rf /usr/share/nginx/html/*

# Copy all game files into the nginx web root
COPY index.html  /usr/share/nginx/html/
COPY style.css   /usr/share/nginx/html/
COPY stages.js   /usr/share/nginx/html/
COPY game.js     /usr/share/nginx/html/

# Custom nginx config: sets correct MIME types,
# enables gzip, and adds security/cache headers
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Render expects the app to listen on PORT env var (default 10000).
# nginx.conf reads $PORT at container start via envsubst.
ENV PORT=10000
EXPOSE 10000

# Use envsubst to inject $PORT before nginx starts
CMD ["/bin/sh", "-c", "envsubst '$PORT' < /etc/nginx/conf.d/default.conf > /tmp/default.conf && cp /tmp/default.conf /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
