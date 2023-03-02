import UserModel from '../models/User.js';

export default (socket, io) => {
	socket.on('authenticate', data => {
		const query = 'update User set socketId = ? where mediaWikiId = ?';
		db.run(query, [socket.id, data.mediawikiId], (err, row) => {
			if (err) {
				console.log(err);
			}
			console.log(row);
		});
		UserModel.updateOne({ mediawikiId: data.mediawikiId }, { $set: { socketId: socket.id } })
			.then(() => {
				console.log('update socket id');
			})
			.catch(err => {
				console.log('error updating socket id');
			});
	});
};
