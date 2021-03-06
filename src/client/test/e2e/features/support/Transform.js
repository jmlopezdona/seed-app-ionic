(function() {
    'use strict';
    var Transform;

    Transform = (function() {
        function Transform() {}

        Transform.prototype.shouldToBoolean = function(expectation) {
            return expectation === 'should';
        };

        Transform.prototype.stringToVariableName = function(string) {
            var firstWord, i, len, varName, word, words;
            varName = '';
            string = string.replace('&', 'And');
            words = string.split(' ');
            firstWord = words.shift();
            varName += firstWord.charAt(0).toLowerCase() + firstWord.substring(1);
            words = words.map(function(word) {
                return word.charAt(0).toUpperCase() + word.substring(1);
            });
            len = words.length;
            for (i = 0; i < len; i++) {
                word = words[i];
                varName += word;
            }

            return varName;
        };

        Transform.prototype.elementTypeToVariableName = function(string) {
            if (string === 'drop down list') {
                return 'Select';
            } else {
                return string.charAt(0).toUpperCase() + string.substring(1);
            }
        };

        return Transform;

    })();

    module.exports = Transform;

}).call(this);
