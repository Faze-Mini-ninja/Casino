# krush.casino — production image
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY index.html ./
COPY css ./css
COPY js ./js
COPY fonts ./fonts
COPY img ./img
COPY server ./server
COPY tools/restore-backup.js ./tools/restore-backup.js
ENV NODE_ENV=production DATA_DIR=/data PORT=8080 HOST=0.0.0.0
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
