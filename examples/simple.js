var AB = require('../index.js');

var test = new AB({
	iterations: 1,
	delay: 0,
	requests: 10,
	concurrency: 5,
	host: 'http://carlosgalancladera.net/',
  headers: {
    'Custom-header': 'custom'
  }
});
test.on('error', function (error){
	console.log('Error', error);
});
test.on('progress', function (progress){
	console.log('Progress', progress);
});
test.on('iteration', function (result){
	console.log('Iteration',result);
});
test.on('finish', function (){
	console.log("Test finished");
});
test.start();