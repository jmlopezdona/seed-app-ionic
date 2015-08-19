/* jshint -W117, -W030, -W098 */
describe('login', function () {
    'use strict';

    var scope;
    var ctrl;

    var modal = {
        hide: sinon.spy(),
        show: sinon.spy(),
        closeLogin: sinon.spy()
    };

    beforeEach(function() {
        module('app');

        bard.inject('$rootScope', '$controller', '$q', '$ionicModal');

        sinon.stub($ionicModal, 'fromTemplateUrl').returns($q.when(modal));

        scope = $rootScope.$new();
        ctrl = $controller('Login', {
            $scope: scope
        });

        $rootScope.$digest();
    });

    it('should be a controller', function() {
        expect(ctrl).to.exist;
    });

    it('should have empty login form', function() {
        expect(scope.loginData).to.be.empty;
    });

    it('should have modal in the scope', function() {
        expect(scope.modal).to.exist;
    });

    it('should show modal when call login', function() {
        scope.login();
        expect(scope.modal.show.calledOnce).to.be.true;
    });

    it('should hide modal when call closeLogin', function() {
        scope.login();
        scope.closeLogin();
        expect(scope.modal.hide.calledOnce).to.be.true;
    });

});