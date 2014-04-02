var spawn = require('child_process').spawn
    , util = require('util')
    , events = require('events');
    
/*
For reference

Usage: ab [options] [http[s]://]hostname[:port]/path
Options are:
    -n requests     Number of requests to perform
    -c concurrency  Number of multiple requests to make
    -t timelimit    Seconds to max. wait for responses
    -b windowsize   Size of TCP send/receive buffer, in bytes
    -p postfile     File containing data to POST. Remember also to set -T
    -u putfile      File containing data to PUT. Remember also to set -T
    -T content-type Content-type header for POSTing, eg.
                    'application/x-www-form-urlencoded'
                    Default is 'text/plain'
    -v verbosity    How much troubleshooting info to print
    -w              Print out results in HTML tables
    -i              Use HEAD instead of GET
    -x attributes   String to insert as table attributes
    -y attributes   String to insert as tr attributes
    -z attributes   String to insert as td or th attributes
    -C attribute    Add cookie, eg. 'Apache=1234. (repeatable)
    -H attribute    Add Arbitrary header line, eg. 'Accept-Encoding: gzip'
                    Inserted after all normal header lines. (repeatable)
    -A attribute    Add Basic WWW Authentication, the attributes
                    are a colon separated username and password.
    -P attribute    Add Basic Proxy Authentication, the attributes
                    are a colon separated username and password.
    -X proxy:port   Proxyserver and port number to use
    -V              Print version number and exit
    -k              Use HTTP KeepAlive feature
    -d              Do not show percentiles served table.
    -S              Do not show confidence estimators and warnings.
    -g filename     Output collected data to gnuplot format file.
    -e filename     Output CSV file with percentages served
    -r              Don't exit on socket receive errors.
    -h              Display usage information (this message)
    -Z ciphersuite  Specify SSL/TLS cipher suite (See openssl ciphers)
    -f protocol     Specify SSL/TLS protocol (SSL3, TLS1, or ALL)

*/

function AB (args) {
    var self = this;
    
    var options = self.options = {
        iterations: 1,
        delay:      15000,
        host:       'http://localhost'
    };
    
    self.args = args || {};
    
    Object.keys(options).forEach(function(key) {
        if (key in args) {
            options[key] = args[key];
        }
    });

    // copy select args into options for use in output 
    options.concurrency = args.concurrency;
    options.requests = args.requests;
    
    self.iterations = [];
    self.iterationsCounter = 0;
}

//Extend EventEmiter
util.inherits(AB, events.EventEmitter);

AB.prototype.start = function () {
    this.iterations = [];
    var self = this;
    try {
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
    } catch(e) {
        self.emit('error',e);
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
        if(data > 0) {
            self.emit('error', {iteration: iteration, code: data, message: 'Invalid ab arguments', args: args});
            return;
        }
        if(stderr) {
            self.emit('error', {iteration: iteration, message: stderr, code: 1});
        } else {
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
        }else if (data.toString().match(/Finished/)){
        //TODO: Iteration finished
        }else {
            stderr+=data;
        }
    });
}

AB.prototype.buildABArgs = function () {
    var cleanArgs = this.cleanArgs = [];
    var options = this.options,
        args = this.args;
    
    var switches = {
        timelimit:      { switch: '-t', value: undefined },
        concurrency:    { switch: '-c', value: 1 },
        requests:       { switch: '-n', value: 1 },
        headers:        { switch: '-H', value: {} },
        windowsize:     { switch: '-b', value: undefined },
        postfile:       { switch: '-p', value: undefined },
        putfile:        { switch: '-u', value: undefined },
        contentType:    { switch: '-T', value: undefined },
        useHead:        { switch: '-i', value: false },
        cookie:         { switch: '-C', value: undefined },
        WWWAuth:        { switch: '-A', value: undefined },
        proxyAuth:      { switch: '-P', value: undefined },
        proxyServer:    { switch: '-X', value: undefined },
        keepAlive:      { switch: '-k', value: false },
        skipReceiveErr: { switch: '-r', value: false },
        ciphersuite:    { switch: '-Z', value: undefined },
        protocol:       { switch: '-f', value: undefined },
    };
    
    // if postfile or putfile use -T
    if ((args.postfile || args.putfile) && !args.contentType) {
        throw new Error('must set contentType with putfile or postfile');
    }
    
    // if timelimit and not requests don't set requests
    if (args.timelimit && !args.requests) {
        delete switches.requests;
    } 
    
    Object.keys(switches).forEach(function(key) {
        if (typeof(switches[key].value) === 'boolean') {
            if (key in args) { if (args[key]) { cleanArgs.push(switches[key].switch); } } 
            else if (switches[key].value) { cleanArgs.push(switches[key].switch); } 
        }
        else if (typeof(switches[key].value) === 'object') {
            if ((key in args) && typeof(args[key]) === 'object') {
                for (var param in args[key]) {
                    cleanArgs.push(switches[key].switch, param + ': ' + args[key][param]);
                }
            }
        }
        else if (key in args) {
            if (args[key] !== undefined) { cleanArgs.push(switches[key].switch, args[key]); }
        }
        else if (switches[key].value) {
            cleanArgs.push(switches[key].switch, switches[key].value);
        }
    });
    
    cleanArgs.push(options.host);
    return cleanArgs;
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
    var total_time          =       /Time taken for tests:\s+([0-9\.]+)/.exec(data),
        complete            =       /Complete requests:\s+(\d+)/.exec(data),
        failed              =       /Failed requests:\s+(\d+)/.exec(data)
        write_errors        =       /Write errors:\s+(\d+)/.exec(data),
        total_transferred   =       /Total transferred:\s+([0-9\.]+)/.exec(data),
        rps                 =       /Requests per second:\s+([0-9\.]+)/.exec(data)
        tr                  =       /Transfer rate:\s+([0-9\.]+)/.exec(data),
        tpr                 =       /Time per request:\s+([0-9\.]+)/.exec(data),
        tpr_ac              =       /Time per request:\s+([0-9\.]+).+\(mean,/.exec(data)

    var retobj = {
        iteration           :       iteration,
        concurrency         :       this.options.concurrency,
        arguments           :       this.cleanArgs,
        total_time          :       parseFloat(total_time[1]),
        complete            :       parseInt(complete[1]),
        failed              :       parseInt(failed[1]),
        write_errors        :       parseInt((write_errors!== null)?write_errors[1]:0),
        total_transferred   :       parseFloat(total_transferred[1]),
        rps                 :       parseFloat(rps[1]),
        tr                  :       parseFloat(tr[1]),
        tpr                 :       parseFloat(tpr[1]),
        tpr_ac              :       parseFloat(tpr_ac[1])
    };

    //Get Server info
    var server_software     =       /Server Software:\s+(.+)/.exec(data),
        server_hostname     =       /Server Hostname:\s+(.+)/.exec(data),
        server_port         =       /Server Port:\s+(.+)/.exec(data);
                
    retobj.server           = {
        software            :       server_software[1],
        hostname            :       server_hostname[1],
        port                :       server_port[1]    
    };
    
    //Get document info
    var document_path       =       /Document Path:\s+(.+)/.exec(data),
        document_length     =       /Document Length:\s+(\d+)\s/.exec(data);
        
    retobj.document         = {
        path                :       document_path[1],
        length              :       parseInt(document_length[1])
    };
    
    //Get connect times
    var connect_times       =       /Connect:\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)/.exec(data),
        processing_times    =       /Processing:\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)/.exec(data),
        waiting_times       =       /Waiting:\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)/.exec(data),
        total_times         =       /Total:\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)\s+([0-9\.]+)/.exec(data);
        
    retobj.times = {
        connect: {
            min     :   connect_times[1],
            mean    :   connect_times[2],
            sd      :   connect_times[3],
            median  :   connect_times[4],
            max     :   connect_times[5]
        },
        processing: {
            min     :   processing_times[1],
            mean    :   processing_times[2],
            sd      :   processing_times[3],
            median  :   processing_times[4],
            max     :   processing_times[5]
        },
        waiting: {
            min     :   waiting_times[1],
            mean    :   waiting_times[2],
            sd      :   waiting_times[3],
            median  :   waiting_times[4],
            max     :   waiting_times[5]
        },
        total: {
            min     :   total_times[1],
            mean    :   total_times[2],
            sd      :   total_times[3],
            median  :   total_times[4],
            max     :   total_times[5]
        }
    };
    return retobj;
}

exports = module.exports = function (args, callback)  {
    return new AB(args, callback);
}
