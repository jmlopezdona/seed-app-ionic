/**
 * Start the tests using karma.
 * @param  {boolean} singleRun - True means run once and end (CI), or keep running (dev)
 * @param  {Function} done - Callback to fire when karma is done
 * @return {undefined}
 */
module.exports = function startTests(singleRun, debug, done) {
    'use strict';
    var child;
    var excludeFiles = [];
    var karma = require('karma').server;
    var log = require('./log');

    var configKarma = {
            configFile: __dirname + '/../../karma.conf.js',
            exclude: excludeFiles,
            singleRun: !!singleRun
        };
    if (!singleRun) {
        configKarma.reporters = ['progress'];
    }
    console.log('debug: ' +  debug);
    if (debug) {
        configKarma.browsers = ['Chrome'];
    }
    karma.start(configKarma, karmaCompleted);

    ////////////////

    function karmaCompleted(karmaResult) {
        log('Karma completed');
        if (child) {
            log('shutting down the child process');
            child.kill();
        }
        if (karmaResult === 1) {
            done('karma: tests failed with code ' + karmaResult);
        } else {
            done();
        }
    }
};
