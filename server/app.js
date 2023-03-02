import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import path from 'path';

import sqlite3 from 'sqlite3'

// import { createRequire } from "module";
// const require = createRequire(import.meta.url);
// const sqlite3 = require('sqlite3').verbose();

import fileUpload from 'express-fileupload';
import session from 'express-session';
import logger from 'morgan';
import PopupTools from 'popup-tools';

import auth from './auth.js';
import config from './config.js';
import { downloadVideo, processVideo, uploadVideos } from './controllers/router-controller.js';
import UserModel from './models/User.js';
import VideoModel from './models/Video.js';
import { log } from 'console';


export const db = new sqlite3.Database("Admin.db", err => {
	if (err) {
		return console.log(err.message);
	} else {
		console.log("connected to Database");
	}
});

const table = `CREATE TABLE if not exists User(
	id VARCHAR(2000),
	username VARCHAR(2000),
	mediawikiId VARCHAR(2000),
	socketId VARCHAR(2000),
	refreshToken VARCHAR(2000),
	mediawikiToken VARCHAR(2000),
	mediawikiTokenSecret VARCHAR(2000)
	);`;


db.run(table, err => {
	if (err) {
		return console.log(err.message)
	}
	else {
		console.log("Table Created");
	}

})



function connectMongoDB(retry = 0) {
	const option = {
		socketTimeoutMS: 30000,
		keepAlive: true,
		useNewUrlParser: true,
		useUnifiedTopology: true
	};

	mongoose
		.connect(config.DB_CONNECTION_URL, option)
		.then(() => console.log('MongoDB Connected'))
		.catch(err => {
			console.log('error', '--------------------');
			console.log(err.message);
			console.log(config.DB_CONNECTION_URL);
			console.log(`Reconnecting to MongoDB ${retry}`);
		});
}

connectMongoDB();

const app = express();

const __dirname =
	process.env.NODE_ENV === 'production' ? `${path.resolve()}/` : `${path.resolve()}/`;

app.use('/api/public', express.static(path.join(__dirname, 'public')));

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

app.use(
	fileUpload({
		useTempFiles: true,
		tempFileDir: 'tmp/', // so that they're publicly accessible
		limits: { fileSize: 500 * 1024 * 1024 },
		abortOnLimit: true
	})
);

app.use(logger('dev'));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

// Use CORS and File Upload modules here
app.use(cors());

app.use(
	session({
		secret: 'OAuth Session',
		saveUninitialized: true
	})
);

/* GET home page. */
app.get('/', (req, res) => {
	res.json({ data: 'Homepage' });
});

app.get('/api/', (req, res) => {
	res.json({ data: 'Back-end is up' });
});

app.get('/api/user/:mediawiki_user_id', async (req, res) => {
	const userId = req.params.mediawiki_user_id;
	const userDoc = await UserModel.findOne({ mediawikiId: userId });
	const videoList = userDoc.videos.map(videoIds => videoIds.toString());
	res.send({
		username: userDoc.username,
		mediawiki_id: userId,
		videos: videoList
	});
});

app.get('/api/video/:video_id', async (req, res) => {
	const { video_id } = req.params;
	const videoData = await VideoModel.findOne(
		{
			_id: mongoose.Types.ObjectId(video_id)
		},
		{ _id: 0 }
	);
	res.send(videoData);
});

app.get('/api/error', (req, res) => {
	res.render('error', { error_message: req.session.error_message });
});

app.get('/test-auth', (req, res) => {
	+res.sendFile(path.join(`${__dirname}/test-auth.html`));
});

app.get('/api/login', (req, res) => {
	const baseUrl = 'https://commons.wikimedia.org';
	const endpoint = '/w/rest.php/oauth2/authorize';

	const url = new URL(baseUrl + endpoint);
	url.searchParams.append('response_type', 'code');
	url.searchParams.append('client_id', config.CLIENT_ID);

	res.send(res.redirect(url));
});

app.get('/api/auth/mediawiki/callback', auth, async (req, res) => {
	const {
		refresh_token: refreshToken,
		profile,
		profile: { sub }
	} = res.locals;

	const userProfile = JSON.parse(JSON.stringify(profile));
	userProfile.refreshToken = refreshToken;
	try {
		db.run(`select username from User where mediaWikiId = ?`, [userProfile.mediawikiId], err => {
			if (err) {
				return console.log(err.message);
			}
			else {
				db.run(`INSERT INTO User(username) values (?)`, [userProfile.username], err => {
					if (err) {
						return console.log(err.message);
					}
					else {
						console.log("User Created");
					}
				})
			}
		})


		await UserModel.updateOne({ mediawikiId: sub }, userProfile, { upsert: true });

		const userDoc = await UserModel.findOne({ mediawikiId: sub }).exec();
		const query = `select * from User where mediaWikiId = ?`;
		db.all(query, [sub], (err, rows) => {
			if (err) {
				throw err;
			}
			rows.forEach((row) => {
				console.log(row);
			});
		});
		const { _id, mediawikiId, username, socketId } = userDoc;
		const returnUserDocData = {
			_id,
			mediawikiId,
			username,
			socketId
		};
		res.end(PopupTools.popupResponse({ user: returnUserDocData }));
	} catch (err) {
		console.log('************');
		console.log(err);
		const error = err.toJSON();
		req.session.error_message = error.message;
		res.redirect('/error');
	}
});

app.get('/api/logout', (req, res) => {
	delete req.session.user;
	res.redirect('/');
});

app.post('/api/process', processVideo);
app.post('/api/upload', uploadVideos);
app.get('/api/download/:videopath', downloadVideo);

// catch 404 and forward to error handler
app.use((req, res, next) => {
	const err = new Error(`Not Found${req.originalUrl}`);
	err.status = 404;
	next(err);
});

// error handler
app.use((err, req, res) => {
	// set locals, only providing error in development
	res.locals.message = err.message;
	res.locals.error = req.app.get('env') === 'development' ? err : {};
	console.log(err);

	// render the error page
	res.status(err.status || 500);
	res.render('error');
});

export default app;
