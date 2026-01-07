# Visor_Publico_EMSV_actualizado
Repositorio que contiene el código del visor público de la EMSV. El proyecto ha sido migrado desde la arquitectura original (Node.js + servidor manual) a una infraestructura basada en 

### Índice
- [Organización de los Directorios del Proyecto](#organización-de-los-directorios-del-proyecto)
- [Tecnologías Utilizadas](#Tecnologías-Utilizadas)
- [Ejecución en Local](#Ejecución-en-Local)
- [Despliegue en Producción](#Despliegue-en-Producción)
- [Actualización del Frontend Público](#Actualización-del-Frontend-Público)
- [Acceso a la API](#Acceso-a-la-API)

### Organización de los Directorios del Proyecto
Explicacion de los diferentes dirrectorios del proyecto:

visor_publico_emsv_actualizacion/
- **visor_publico_emsv_client_actualizado(/clienvisor_publico_emsv_client_actualizadot/)**, build del frontend React.
- **Dockerfile.frontend(/Dockerfile.frontend/)**, imagen del frontend Nginx.
- **nginx_conf_publico(/nginx_conf_publico/)**, configuraciones históricas (no activas)
- **server(/server/)**, carpeta heredada (no utilizada)

El visor público comparte el mismo backend a través del servicio Docker:
- backend-privado (lectura / escritura privada)
- gateway (lectura pública controlada)
No existe un backend independiente del visor público.

### Tecnologías Utilizadas
Frontend:
- React + MUI
- React-Leaflet
- Nivo Charts

Backend compartido:
- FastAPI + DuckDB
- Consultas espaciales
- API de solo lectura para el público

Infraestructura:
- Docker + Docker Compose
- Nginx como reverse proxy HTTPS

### Ejecución en Local

Frontend
- Desarrollo:
  npm install
  npm run dev
- Generación del build:
  npm run build

La API no se ejecuta desde esta carpeta:
se sirve desde el backend compartido en Docker.

### Despliegue en Producción

1) Compilar frontend:
   npm run build

2) Copiar archivos al servidor:
   visor_publico/visor_publico_emsv_client_actualizado

3) Construir contenedor público:
   docker compose build frontend-publico
   docker compose up -d frontend-publico

### Actualización del Frontend Público

Cada actualización requiere:
1) Generar nuevo build React
2) Subir index.html + assets
3) Reconstruir imagen del contenedor:
   docker compose build frontend-publico
   docker compose up -d frontend-publico

### Acceso a la API

El visor público accede a la API pasando por el gateway:

   /api_2/...

- Las peticiones GET son de solo lectura
- Las operaciones de escritura están bloqueadas
- El backend real reside en backend-privado


### Créditos 
Cordinador del proyecto por Asier Aguilaz [linkedin](https://www.linkedin.com/in/asier-eguilaz/)

Creado por Juan Jiménez Fernández [linkedin](https://www.linkedin.com/in/juan-jimenez-fernandez-b16b99119/)

Creado por Miguel Salas Heras [linkedin](https://www.linkedin.com/in/miguelsalasheras/)

