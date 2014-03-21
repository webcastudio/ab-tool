var spawn = require('child_process').spawn
	, util = require('util')
	, events = require('events');

function AB (args) {
	var self = this;
	var iterations = args.iterations || 1,
		delay = args.delay || 15000,
		concurrency = args.concurrency || 1,
		requests = args.requests || 1,
		host = args.host || 'http://localhost/';
	this.options = {
		iterations : iterations,
		delay : delay,
		concurrency: concurrency,
		requests: requests,
		host : host
	}
	this.iterations = [];
	this.iterationsCounter = 0;
}
//Extend EventEmiter
util.inherits(AB, events.EventEmitter);

AB.prototype.start = function () {
	this.iterations = [];
	var self = this;
	if(this.options.iterations > 1){
		//Handle interations
		self.on('iteration', function (result){
			self.iterations.push(result);
			if(self.iterations.length == self.options.iterations)
				self.emit('finish');
		});
		self.on('error', function (error){
			self.iterations.push(error);
			if(self.iterations.length == self.options.iterations)
				self.emit('finish');
		});
		//Initialize iterations counter
		self.iterationsCounter = 1;
		//Start first iteration
		self.spawnProcess();
		//Set interval
		var interval = setInterval(function (){
			self.iterationsCounter++;
			self.spawnProcess();
			if(self.iterationsCounter == self.options.iterations){
				clearInterval(interval);
			}
		}, self.options.delay);
	}else{
		this.on('iteration', function (result){
			self.iterations.push(result);
			self.emit('finish');
		});
		this.on('error', function (error){
			self.iterations.push(error);
			self.emit('finish');
		});
		this.spawnProcess();
	}
};

AB.prototype.spawnProcess = function (callback) {
	var self = this;
	var args = this.buildABArgs();
	var proc = spawn('ab', args);
	var stdout = '';
    var stderr = '';
    var iteration = this.iterationsCounter;
    //Handle process events
	proc.on('exit', function (data){
		if(data > 0){
			self.emit('error', {iteration: iteration, code: data, message: 'Invalid ab arguments'});
			return;
		}
		if(stderr){
			self.emit('error', {iteration: iteration, message: stderr, code: 1});
		}else {
			var result = self._processOutput(iteration,stdout);
			self.emit('iteration', result);
		}
	});
	proc.stdout.on('data', function (data){
		stdout+=data;
	});
	proc.stderr.on('data', function (data){
		if(data.toString().match(/Completed/)){
			var progress = self._processProgress(iteration, data.toString());
			self.emit('progress', progress);
		}else {
			stderr+=data;
		}
	});
}
AB.prototype.buildABArgs = function () {
	var args = [];
	var options = this.options;
	
	args.push('-c', options.concurrency);
	args.push('-n', options.requests);
	args.push(options.host);
	return args;
}
AB.prototype._processProgress = function (iteration, data) {
	var requests = /Completed\s(\d+)\srequests/.exec(data);
	var retobj = {
		iteration: iteration,
		requests: parseInt(requests[1]),
		progress: Math.floor((parseInt(requests[1])/this.options.requests)*100)
	};
	return retobj;
}
AB.prototype._processOutput = function (iteration, data) {
	//Get stats
	var	total_time			=		/Time taken for tests:\s+([0-9\.]+)/.exec(data),
		complete			=		/Complete requests:\s+(\d+)/.exec(data),
		failed				=		/Failed requests:\s+(\d+)/.exec(data)
		write_errors		=		/Write errors:\s+(\d+)/.exec(data),
		total_transferred	=		/Total transferred:\s+([0-9\.]+)/.exec(data),
		rps					=		/Requests per second:\s+([0-9\.]+)/.exec(data)
		tr					=		/Transfer rate:\s+([0-9\.]+)/.exec(data),
		tpr					=		/Time per request:\s+([0-9\.]+)/.exec(data),
		tpr_ac				=		/Time per request:\s+([0-9\.]+).+\(mean,/.exec(data)
	var retobj = {
		iteration			:		iteration,
		concurrency			: 		this.options.concurrency,
		total_time			:		parseFloat(total_time[1]),
		complete			:		parseInt(complete[1]),
		failed				:		parseInt(failed[1]),
		write_errors		:		parseInt(write_errors[1]),
		total_transferred	:		parseFloat(total_transferred[1]),
		rps					:		parseFloat(rps[1]),
		tr					:		parseFloat(tr[1]),
		tpr					:		parseFloat(tpr[1]),
		tpr_ac				:		parseFloat(tpr_ac[1])
	};
	//Get Server info
	var server_software		= 		/Server Software:\s+(.+)/.exec(data),
		server_hostname 	= 		/Server Hostname:\s+(.+)/.exec(data),
		server_port			=		/Server Port:\s+(.+)/.exec(data);		
	retobj.server = {
		software 			: 		server_software[1],
		hostname			:		server_hostname[1],
		port				:		server_port[1]	
	}
	//Get document info
	var document_path		=		/Document Path:\s+(.+)/.exec(data),
		document_length		=		/Document Length:\s+(\d+)\s/.exec(data);
	retobj.document = {
		path				:		document_path[1],
		length				:		parseInt(document_length[1])
	};
	//Get connect times
	var	connect_times		=		/Connect:\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)/.exec(data),
		processing_times	=		/Processing:\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)/.exec(data),
		waiting_times		=		/Waiting:\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)/.exec(data),
		total_times			=		/Total:\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)/.exec(data);
	retobj.times = {
		connect: {
			min		: 	connect_times[1],
			mean	:	connect_times[2],
			sd		:	connect_times[3],
			median	:	connect_times[4],
			max		:	connect_times[5]
		},
		processing: {
			min		: 	processing_times[1],
			mean	:	processing_times[2],
			sd		:	processing_times[3],
			median	:	processing_times[4],
			max		:	processing_times[5]
		},
		waiting: {
			min		: 	waiting_times[1],
			mean	:	waiting_times[2],
			sd		:	waiting_times[3],
			median	:	waiting_times[4],
			max		: 	waiting_times[5]
		},
		total: {
			min		: 	total_times[1],
			mean	:	total_times[2],
			sd		:	total_times[3],
			median	:	total_times[4],
			max		: 	total_times[5]
		}
	};
	return retobj;
}
exports = module.exports = function (args, callback)  {
	return new AB(args, callback);
}