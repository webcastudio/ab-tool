var AB = require('../index.js');

var test = new AB({
	iterations: 1,
	delay: 0,
	requests: 1,
	concurrency: 1,
	host: 'http://www.carlosgalancladera.net/'
});
test.on('error', function (error){
	console.log('Test error: '+error);
});
test.on('iteration', function (result){
	console.log(result);
});
test.on('finish', function (){
	console.log("Test finished");
});
test.start();