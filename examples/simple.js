var AB = require('../index.js');

var test = new AB({
	iterations: 10,
	delay: 10000,
	requests: 10,
	concurrency: 2,
	host: 'http://www.carlosgalancladera.net/'
});
test.on('iteration', function (result){
	console.log(result);
});
test.on('finish', function (){
	console.log("Test finished");
});
test.start();