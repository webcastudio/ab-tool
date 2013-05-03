var AB = require('../index.js');

var test = new AB({
	iterations: 2,
	delay: 0,
	requests: 2000,
	concurrency: 20,
	host: 'http://pulldev.webcasting-studio.net/?s=questions&part_id=588'
});
test.on('error', function (error){
	console.log(error);
});
test.on('progress', function (progress){
	console.log(progress);
});
test.on('iteration', function (result){
	console.log(result);
});
test.on('finish', function (){
	console.log("Test finished");
});
test.start();