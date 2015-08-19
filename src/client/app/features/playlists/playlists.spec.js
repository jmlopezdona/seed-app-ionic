/* jshint -W117, -W030, -W098 */
describe('playlists', function () {
    'use strict';

    var scope;
    var ctrl;

    beforeEach(function() {
        module('app');

        bard.inject('$rootScope', '$controller');

        scope = $rootScope.$new();
        ctrl = $controller('Playlists', {
            $scope: scope
        });
    });

    it('should be a controller', function() {
        expect(ctrl).to.exist;
    });

    it('should have a playlists attribute', function() {
        expect(ctrl.playlists).to.exists;
    });
});
