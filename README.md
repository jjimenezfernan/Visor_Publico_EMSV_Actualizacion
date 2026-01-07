# Visor_Publico_EMSV_actualizado
Repositorio que contiene el código del visor público de la EMSV. El proyecto ha sido migrado desde la arquitectura original (Node.js + servidor manual) a una infraestructura basada en 

### Índice
- [Organización de los Directorios del Proyecto](#organización-de-los-directorios-del-proyecto)
- [Ejecutar la Página Web](#ejecutar-la-página-web)

### Organización de los Directorios del Proyecto
Explicacion de los diferentes dirrectorios del proyecto:

visor_publico/
 ├─ visor_publico_emsv_client_actualizado/   → build del frontend React
 ├─ Dockerfile.frontend                      → imagen del frontend Nginx
 ├─ nginx_conf_publico/                      → configuraciones históricas (no activas)
 └─ server/                                  → carpeta heredada (no utilizada)

El visor público comparte el mismo backend
a través del servicio Docker:

- backend-privado (lectura / escritura privada)
- gateway (lectura pública controlada)

No existe un backend independiente del visor público.

- **[client](/client/)**, código desarrollado en el FrameWork React para la página web.
- **[server](/server/)**, código desarrollado en node.js para la API de la página web.
- **[visor_publico_emsv_nginx_node_server](/visor_publico_emsv_nginx_node_server/)**, diferentes archivos de configuración para el despligue de la página web en kutone. 

### Ejecutar la Página Web
En primer luegar, habra que ejecutar el sigiente comando **`npm install`**, tanto en la carpeta *server* como *client*, para poder instalar los diferentes paquetes de los que depende la página web.

A continuación, dependiendo se vamos ejecutar en local el proyecto, para desarrollar algun nuevo comoponente, o si vamos a hacer el deploy de la página en producción deberemos llevar a cabo distintos pasos:
    - [Ejecución de forma Local](#ejecución-de-forma-local)
    - [Deploy en Producción](#deploy-en-producción)

Destacar que aunque le server se ejecute de forma local o el producción este siempre escuchara en el puerto 3040.

#### Ejecución de forma Local

En el directorio *server* deberemos ejecutar el siguiente comando: **`npm run dev`**.
En el directorio *client* deberemos ejecutar el siguiente comando: **`npm run dev`**.

#### Deploy en Producción

En el directorio *server* deberemos ejecutar el siguiente comando: **`node server.js`**.
En el directorio *client* deberemos ejecutar el siguiente comando: **`npm run build`**, este nos creara una carpeta **dist** que contendra la páigna web creada, esto solo habrá que moverlo a dirrectorio donde el servidor web guarde las páginas webs para servirlas a los clientes.

### Créditos 
Cordinador del proyecto por Asier Aguilaz [linkedin](https://www.linkedin.com/in/asier-eguilaz/)

Urban Planner Samanta Arnal Martín [linkedin](https://www.linkedin.com/in/samanta-arnal/)

Creado por Miguel Salas Heras [linkedin](https://www.linkedin.com/in/miguelsalasheras/)

Basado en el Observatirio de EPIU [github](https://github.com/KhoraUrbanThinkers/Visor_EPIUGetafe)
