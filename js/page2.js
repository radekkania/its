app.controller("Page2", [ "$http", "common", function($http, common) {

			var ctrl = this;

		    ctrl.common = common;

			ctrl.nSkip = 0;
			ctrl.nLimit = 5;
			ctrl.nAll = 0;
			
			ctrl.from = new Date(new Date().setHours(0,0,0,0) - 6*1000*60*60*24);
			ctrl.to = new Date(new Date().setHours(0,0,0,0));

			ctrl.getHistory = function() {

				var realTo = new Date(ctrl.to.getTime() + 1000*60*60*24);
				
				$http.get("/history?from=" + ctrl.from.getTime() + "&to=" + realTo.getTime()).then(
						function(rep) {
							ctrl.nAll = rep.data.length;
						},
						function(err) {
							ctrl.nAll = 0;
						}
				);
				
				$http.get("/history?skip=" + ctrl.nSkip +
				          "&limit=" + ctrl.nLimit + 
						  "&from=" + ctrl.from.getTime() + 
						  "&to=" + realTo.getTime()).then(
					function(rep){
						ctrl.history = rep.data;
					},
					function(err) {
						ctrl.history = [];
					}
				);
			}

			ctrl.refresh = function() {

			}

			ctrl.incLimit = function() {
				ctrl.nLimit++;
				ctrl.getHistory();
			}
			
			ctrl.incSkip = function() {
				ctrl.nSkip++;
				ctrl.getHistory();
			}
			
			ctrl.getHistory();
		}
	]);