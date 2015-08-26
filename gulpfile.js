/* jshint -W071 */
'use strict';
(function() {

    /**
     * yargs variables can be passed in to alter the behavior, when present.
     * Example: gulp serve-dev
     *
     * --verbose  : Various tasks will produce more output to the console.
     * --startServers: Will start servers for midway tests on the test task.
     */

    var args = require('yargs').argv;
    var config = require('./gulp.config')();
    var protractor = require('gulp-protractor').protractor;
    var gulp = require('gulp');
    var glob = require('glob');
    var vinylPaths = require('vinyl-paths');
    var del = require('del');
    var moment = require('moment');
    var pgBuild = require('phonegap-build-api');
    var fs = require('fs');
    var request = require('request');
    var $ = require('gulp-load-plugins')({lazy: true});
    var gulpsync = require('gulp-sync')(gulp);

    /**
     * List the available gulp tasks
     */
    gulp.task('help', $.taskListing);
    gulp.task('default', ['help']);

    /**
     * vet the code and create coverage report
     * @return {Stream}
     */
    gulp.task('vet', function() {
        log('Analyzing source with JSHint and JSCS');

        return gulp
            .src(config.alljs)
            .pipe($.if(args.verbose, $.print()))
            .pipe($.jshint())
            .pipe($.jshint.reporter('jshint-stylish', {verbose: true}))
            .pipe($.jshint.reporter('fail'))
            .pipe($.jscs());
    });

    /**
     * Create a visualizer report
     */
    gulp.task('plato', function(done) {
        log('Analyzing source with Plato');
        log('Browse to /report/plato/index.html to see Plato results');

        startPlatoVisualizer(done);
    });

    /**
     * Compile sass to css
     * @return {Stream}
     */
    gulp.task('build-styles', ['clean-styles'], function(done) {
        log('Compiling Sass --> CSS');

        gulp.src(config.sass)
        .pipe($.sass({
            errLogToConsole: true
        }))
        .pipe(gulp.dest(config.css))
        .on('end', done);
    });

    /**
     * Copy fonts
     * @return {Stream}
     */
    gulp.task('build-fonts', ['clean-fonts'], function() {
        log('Copying fonts');

        return gulp
            .src(config.fontsFromBower)
            .pipe(gulp.dest(config.fonts));
    });

    /**
     * Compress images
     * @return {Stream}
     */
    gulp.task('package-images', function() {
        log('Compressing and copying images');

        return gulp
            .src(config.img + '**/*')
            .pipe($.imagemin({optimizationLevel: 4}))
            .pipe(gulp.dest(config.build + 'img'));
    });

    /**
     * Create $templateCache from the html templates
     * @return {Stream}
     */
    var templateCache = function() {
         log('Creating an AngularJS $templateCache');

         return gulp
             .src(config.htmltemplates)
             .pipe($.if(args.verbose, $.bytediff.start()))
             .pipe($.minifyHtml({empty: true}))
             .pipe($.if(args.verbose, $.bytediff.stop(bytediffFormatter)))
             .pipe($.angularTemplatecache(
                 config.templateCache.file,
                 config.templateCache.options
             ))
             .pipe(gulp.dest(config.cache));
     };
    gulp.task('build-templatecache', templateCache);

    /**
     * Wire-up the bower dependencies
     * @return {Stream}
     */
    gulp.task('inject-wiredep', function () {
        log('Wiring the bower dependencies into the html');

        var wiredep = require('wiredep').stream;
        var options = config.getWiredepDefaultOptions();

        return gulp
            .src(config.index)
            .pipe(wiredep(options))
            .pipe(gulp.dest(config.client));
    });

    /**
     * Wire-up the js app dependencies
     * @return {Stream}
     */
    var injectJsAppDep = function () {
        log('Wiring the js app dependencies into the html');

        // Only include stubs if flag is enabled
        var js = args.mocks ? [].concat(config.js, config.mocksjs) : config.js;

        return gulp
            .src(config.index)
            .pipe(inject(js, '', config.jsOrder))
            .pipe(gulp.dest(config.client));
    };
    gulp.task('inject-jsAppDep', injectJsAppDep);

    gulp.task('build-inject', ['inject-wiredep', 'inject-jsAppDep', 'build-styles', 'build-templatecache'], function() {
        log('Wire up css into the html, after files are ready');

        return gulp
            .src(config.index)
            .pipe(inject(config.css + '**/*.css'))
            .pipe(gulp.dest(config.client));
    });

    /**
     * Empaqueta, comprime y sube a PhoneGap Build
     */
    gulp.task('dist', gulpsync.sync(['package', 'dist-zip', 'dist-upload']));

    /**
     * Comprime el paquete de la aplicación en dist
     */
    gulp.task('dist-zip', function() {
        var packagePaths = [].concat(
            config.build + '/**/*',
            './config.xml',
            './plugins/**/*',
            './hooks/**/*'
        );

        var env = config.ensure.environment(args.env, args.debugmode);
        var timestamp = moment().format('YYYYMMDDhhmmss');
        var archiveName = config.cordova[env].appNamespace + '_' + timestamp + '.zip';

        return gulp.src(packagePaths, {base: './'})
            .pipe($.zip(archiveName))
            .pipe(gulp.dest(config.dist));
    });

    gulp.task('dist-upload', function (done) {
        var endpoint = '/apps/' + config.phoneGap.appId;
        var env = config.ensure.environment(args.env, args.debugmode);
        var platform = 'android';
        pgBuild.auth({token: config.phoneGap.authToken}, function (e, api) {
            gulp.src(config.dist + '*.zip').pipe($.tap(function (file, t) {
                var options = {
                    form: {
                        data: {
                            debug: config.phoneGap.debug[env],
                            keys: config.phoneGap.keys[env]
                        },
                        file: file.path
                    }
                };
                api.put(endpoint, options, function() {
                    console.log('upload to PhoneGap Build done');
                    api.post(endpoint + '/build', function() {
                        console.log('build at PhoneGap Build done');
                        var download = setInterval(function() {
                            api.get(endpoint, function (ee, data) {
                                var status = !ee && data ? data.status[platform] : null;
                                if (status === 'complete') {
                                    var filePath = config.dist + data.package + '.' +
                                        data.version + config.extension(platform);
                                    var write = api.get(endpoint + '/' + platform).pipe(fs.createWriteStream(filePath));
                                    clearInterval(download);
                                    write.on('finish', function () {
                                        var form = {
                                            // jscs:disable requireCamelCaseOrUpperCaseIdentifiers
                                            'api_key': '6a5929b229bb38a371c54f079e2fb529d6846d22',
                                            'file': fs.createReadStream(filePath),
                                            'video': 'wifi',
                                            'auto-update': 'on'
                                            // jscs:disable requireCamelCaseOrUpperCaseIdentifiers
                                        };

                                        endpoint = 'https://app.testfairy.com/api/upload/';
                                        request.post(
                                            {
                                                url: endpoint,
                                                formData: form
                                            },
                                            function (err, httpResponse, body) {
                                                //requestCallBack(err, httpResponse, body);
                                                console.log('testfairy response:' + httpResponse + body);
                                                done();
                                            });
                                    });
                                }
                                else {
                                    console.log('Cannnot download application[' + platform + ']: ' + status);
                                }
                            });
                        }, 5000);
                    });
                });
                return t;
            }));
        });
    });

    /**
     * Build everything
     * This is separate so we can run tests on
     * optimize before handling image or fonts
     */
    gulp.task('package', gulpsync.sync(['package-optimize', 'package-fonts', 'package-images']), function() {
        log('Packaging everything');

        var msg = {
            title: 'gulp package',
            subtitle: 'Deployed to the build folder',
            message: 'Running `ionic serve`, `ionic emulate` ...'
        };

        log(msg);
    });

    /**
     * Copia imagenes al directorio de empaquetado
     */
    gulp.task('package-fonts', function() {
        log('Packaging fonts');
        return gulp.src(config.fonts + '**/*', {base: './src/client'})
            .pipe(gulp.dest(config.build));
    });

    /**
     * Optimize all files, move to a build folder,
     * and inject them into the new index.html
     * @return {Stream}
     */
    gulp.task('package-optimize', ['clean', 'build-inject', 'build-fonts', 'test'], function() {
        log('Optimizing the js, css, and html');

        var assets = $.useref.assets({searchPath: './src/client'});
        // Filters are named for the gulp-useref path
        var cssFilter = $.filter('**/*.css', {restore: true});
        var jsAppFilter = $.filter('**/' + config.optimized.app, {restore: true});
        var jslibFilter = $.filter('**/' + config.optimized.lib, {restore: true});

        var templateCache = config.cache + config.templateCache.file;

        return gulp
            .src(config.index)
            .pipe($.plumber())
            .pipe(inject(templateCache, 'templates'))
            .pipe(assets) // Gather all assets from the html with useref
            // Get the css
            .pipe(cssFilter)
            .pipe($.minifyCss())
            .pipe(cssFilter.restore)
            // Get the custom javascript
            .pipe(jsAppFilter)
            .pipe($.ngAnnotate({add: true}))
            .pipe($.uglify())
            .pipe(jsAppFilter.restore)
            // Get the vendor javascript
            .pipe(jslibFilter)
            .pipe($.uglify()) // another option is to override wiredep to use min files
            .pipe(jslibFilter.restore)
            // Take inventory of the file names for future rev numbers
            .pipe($.rev())
            // Apply the concat and file replacement with useref
            .pipe(assets.restore())
            .pipe($.useref())
            // Replace the file names in the html with rev numbers
            .pipe($.revReplace())
            .pipe(gulp.dest(config.build));
    });

    /**
     * Run specs once and exit
     * @return {Stream}
     */
    gulp.task('test', ['vet', 'build-templatecache'], function(done) {
        startTests(true /*singleRun*/ , done);
    });

    /**
     * Run specs and wait.
     * Watch for file changes and re-run tests on each change
     */
    gulp.task('autotest', ['build-templatecache'], function(done) {
        // Si se modifica, crea o borran templates se genera de nuevo la cache de templates
        $.watch('src/client/app/**/*.html', {events: ['add', 'change', 'unlink', 'unlinkDir']}, templateCache);

        startTests(false /*singleRun*/ , done);
    });

    gulp.task('build', ['clean', 'build-inject', 'build-fonts', 'test'], function() {
        log('Building everything');

        var buildPaths = [].concat(
            config.app + '**/*',
            config.css + '**/*',
            config.img + '**/*',
            config.bower.directory + '**/*',
            config.cache + '**/*',
            config.mocks + '**/*',
            config.index
        );

        gulp.src(buildPaths, {base: './src/client'})
            .pipe(gulp.dest(config.build));

        var msg = {
            title: 'gulp build',
            subtitle: 'Deployed to the build folder',
            message: 'Running `ionic serve`, `ionic emulate` ...'
        };

        log(msg);
    });

    /**
     * Realiza un build y pasa a observar cambios para re-build
     * @return {Stream}
     */
    gulp.task('watch', function() {
        // Si se incluye --build=false no se contruye la aplicación en www
        if (args.build === undefined || args.build === 'true') {
            gulp.start('build');
        }

        // Se crea un filtro para incluir todos los ficheros que son añadidos o modificados
        // Es decir, todos menos aquellos que son borrados ('unlink')
        var notDeletedFilter = $.filter(
          function(file) {
              return file.event !== 'unlink' && file.event !== 'unlinkDir';
          },
          {restore: true}
        );

        // El método restore obtiene los ficheros que no cumplen el filtro, es decir, los que
        // han sido borrados ('unlink') del origen, se pasan al pipe destino y se borran
        notDeletedFilter.restore
            .pipe(gulp.dest('www'))
            .pipe(vinylPaths(function(file, cb) {
                del(file, cb);
            }));

        // Si se modifica el fichero sass se generan de nuevos los css
        gulp.watch([config.sass], ['build-styles']);

        // Si se modifica, crea o borran templates se genera de nuevo la cache de templates
        $.watch('src/client/app/**/*.html', {events: ['add', 'change', 'unlink', 'unlinkDir']}, templateCache);

        // Si se modifican, crean o borran js se realiza de nuevo la inyección en index.html
        var source = [].concat('src/client/app/**/*.js', 'src/client/mocks/**/*.js');
        $.watch(source, {events: ['add', 'change', 'unlink', 'unlinkDir']}, injectJsAppDep);

        // Se observan todos los ficheros de src/client y se copian a la carpeta build aquellos que
        // son modificados o añadidos para mantenerla sincronizada
        $.watch('src/client/**/*', {events: ['add', 'change', 'unlink', 'unlinkDir']})
            .pipe(notDeletedFilter)
            .pipe(gulp.dest(config.build));
    });

    /**
     * Corrige los errores detectados por jscs
     * @return {Stream}
     */
    gulp.task('jscs', function() {
        $.run('jscs src/client/app/js gulpfile.js  --fix').exec()
          .on('error', function() {
        });
    });

    /**
     * Remove all files from the build and reports folders
     * @param  {Function} done - callback when complete
     */
    gulp.task('clean', function(done) {
        var delconfig = [].concat(config.build + '**/*', config.dist, config.report);
        log('Cleaning: ' + $.util.colors.blue(delconfig));
        del(delconfig, done);
    });

    /**
     * Remove all fonts from the build folder
     * @param  {Function} done - callback when complete
     */
    gulp.task('clean-fonts', function(done) {
        del(config.fonts + '**/*', done);
    });

    /**
     * Remove all styles from the build and temp folders
     * @param  {Function} done - callback when complete
     */
    gulp.task('clean-styles', function(done) {
        del(config.css + '**/*.css', done);
    });

    /**
     * Lanza las pruebas e2e (es necesario que esté publicada la aplicación)
     */
    gulp.task('e2e', function() {
        gulp.src(['./src/client/test/e2e/*.js'])
          .pipe(protractor({
              configFile: 'protractor.conf.js'
          }))
          .on('error', function(e) { throw e; });
    });

    /**
     * Start Plato inspector and visualizer
     */
    function startPlatoVisualizer(done) {
        log('Running Plato');

        var files = glob.sync(config.plato.js);
        var excludeFiles = /.*\.spec\.js/;
        var plato = require('plato');

        var options = {
            title: 'Plato Inspections Report',
            exclude: excludeFiles
        };
        var outputDir = config.report + '/plato';

        plato.inspect(files, outputDir, options, platoCompleted);

        function platoCompleted(report) {
            var overview = plato.getOverviewReport(report);
            if (args.verbose) {
                log(overview.summary);
            }
            if (done) { done(); }
        }
    }

    /**
     * Start the tests using karma.
     * @param  {boolean} singleRun - True means run once and end (CI), or keep running (dev)
     * @param  {Function} done - Callback to fire when karma is done
     * @return {undefined}
     */
    function startTests(singleRun, done) {
        var child;
        var excludeFiles = [];
        var karma = require('karma').server;

        var configKarma = {
            configFile: __dirname + '/karma.conf.js',
            exclude: excludeFiles,
            singleRun: !!singleRun
        };
        if (!singleRun) {
            configKarma.reporters = ['progress'];
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
    }

    /**
     * Inject files in a sorted sequence at a specified inject label
     * @param   {Array} src   glob pattern for source files
     * @param   {String} label   The label name
     * @param   {Array} order   glob pattern for sort order of the files
     * @returns {Stream}   The stream
     */
    function inject(src, label, order) {
        var options = {read: false, relative: true};
        if (label) {
            options.name = 'inject:' + label;
        }

        return $.inject(orderSrc(src, order), options);
    }

    /**
     * Order a stream
     * @param   {Stream} src   The gulp.src stream
     * @param   {Array} order Glob array pattern
     * @returns {Stream} The ordered stream
     */
    function orderSrc (src, order) {
        return gulp
            .src(src)
            .pipe($.if(order, $.order(order)));
    }

    /**
     * Log a message or series of messages using chalk's blue color.
     * Can pass in a string, object or array.
     */
    function log(msg) {
        if (typeof msg === 'object') {
            for (var item in msg) {
                if (msg.hasOwnProperty(item)) {
                    $.util.log($.util.colors.blue(msg[item]));
                }
            }
        } else {
            $.util.log($.util.colors.blue(msg));
        }
    }

    /**
     * Formatter for bytediff to display the size changes after processing
     * @param  {Object} data - byte data
     * @return {String}      Difference in bytes, formatted
     */
    function bytediffFormatter(data) {
        var difference = data.savings > 0 ? ' smaller.' : ' larger.';
        return data.fileName + ' went from ' +
            (data.startSize / 1000).toFixed(2) + ' kB to ' +
            (data.endSize / 1000).toFixed(2) + ' kB and is ' +
            formatPercent(1 - data.percent, 2) + '%' + difference;
    }

    /**
     * Format a number as a percentage
     * @param  {Number} num       Number to format as a percent
     * @param  {Number} precision Precision of the decimal
     * @return {String}           Formatted perentage
     */
    function formatPercent(num, precision) {
        return (num * 100).toFixed(precision);
    }
})();
