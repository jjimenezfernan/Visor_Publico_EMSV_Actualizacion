// Direccion del servidor de la API

let DIRECTION;

if (process.env.NODE_ENV === 'production') {
    DIRECTION = 'https://visorpublicoemsvactualizado.khoraurbanthinkers.es';
} else {
    DIRECTION = 'http://localhost:3040';
}

export { DIRECTION };
