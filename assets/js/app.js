(function() {
	'use strict';
	
	angular.module('app', [
		'ngRoute',
		'ngSails',
		'angular.filter',
		'app.search'
	]).config(['$routeProvider', function ($routeProvider) {
		$routeProvider.when('/', {
			templateUrl : '/templates/main'
		}).when('/search', {
			templateUrl : '/templates/search',
			controller : 'SearchController',
			controllerAs : 'searchController'
		}).otherwise({
			redirectTo : '/'
		});
	}]);
})();