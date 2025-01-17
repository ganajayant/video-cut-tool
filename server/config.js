let config;

switch (process.env.NODE_ENV) {
	case 'production':
		config = {
			DB_CONNECTION_URL: 'mongodb://localhost:27017/video-cut-tool',
			BACKEND_URL: 'https://videocuttool.wmcloud.org/api/',
			PORT: 4000,

			// Ouath 2
		};
		break;
	default:
		config = {
			DB_CONNECTION_URL: 'mongodb://videocuttool-mongo:27017/video-cut-tool',
			BACKEND_URL: 'http://videocuttool:4000/api/',
			PORT: 4000,

			// OAuth2 Credentials
		};
}

export default config;
