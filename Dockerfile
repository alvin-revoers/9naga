FROM node:20-alpine

WORKDIR /app

# Salin seluruh file proyek
COPY . .

# Instal semua dependensi dan langsung kompilasi aplikasinya
RUN npm install && npm run build

# Tentukan port default aplikasi
EXPOSE 20128

# Jalankan perintah start saat kontainer menyala
CMD ["npm", "run", "start"]

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "custom-server.js"]
