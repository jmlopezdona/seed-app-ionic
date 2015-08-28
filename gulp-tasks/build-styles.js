module.exports = function (gulp, plugins, config) {
    'use strict';

    var log = require('./util/log');

    return function() {
        log('Compiling Sass --> CSS');

        var sassOptions = {
             style: 'expanded',
             errLogToConsole: true
         };

        var injectFiles = gulp.src([
             './src/client/app/**/*.scss',
             '!' + config.sass
         ], {read: false});

        var injectOptions = {
             transform: function(filePath) {
                 filePath.replace('src/client/app/', '../app/');
                 return '@import "' + filePath + '";';
             },
             starttag: '// injector',
             endtag: '// endinjector',
             addRootSlash: false
         };

        return gulp.src(config.sass)
            .pipe(plugins.inject(injectFiles, injectOptions))
            .pipe(plugins.sass(sassOptions)).on('error', config.errorHandler('Sass'))
            .pipe(plugins.autoprefixer()).on('error', config.errorHandler('Autoprefixer'))
            .pipe(gulp.dest(config.css));
    };
};
