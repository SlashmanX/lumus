function getParameter(name) {
	return decodeURI(
		(RegExp(name + '=' + '(.+?)(&|$)').exec(location.search)||[,null])[1]
	);
}

function findAlbums(artistId, artistName) {
	$.getJSON("http://musicbrainz.org/ws/2/release-group?artist=" + artistId + "&fmt=json", function(data) {
		listAlbums(artistId, artistName, data["release-groups"]);
	});	
}

function sortByYear(results) {
	results.sort(function (result1, result2) {
		var year1 = result1["first-release-date"];
		year1 = year1.substr(0, year1.indexOf('-')) || year1;
		
		var year2 = result2["first-release-date"];
		year2 = year2.substr(0, year2.indexOf('-')) || year2;
		
		result1.Year = year1;
		result2.Year = year2;

		return (year1 < year2) ? 1 : -1;
	});
}

function listAlbums(artistId, artistName, results) {
	sortByYear(results);

	$.each(results, function(key, val) {
		var name = val.name + (val.disambiguation ? " (" + val.disambiguation + ")" : "");
		
		if (val["first-release-date"]) {
			var type = val["primary-type"];
			
			if (type === "Album")
				$(getAlbumItem(artistId, artistName, val)).appendTo("#albums");
			else
				$(getAlbumItem(artistId, artistName, val)).appendTo("#other");				
		}
	});
}

function encodeName(value){
	return value.replace('\'', '&#39;');
}

function getAlbumItem(artistId, artistName, albumInfo) {
	var item = 
		"<p><span class='fa fa-music'></span> " +
		albumInfo.title + " (" + albumInfo["primary-type"] + ", " + albumInfo.Year + ")" +
		//" <a class='btn btn-default btn-xs' href='/music/add?artistId=" + artistId + "&album=" + encodeName(albumInfo.title) + "'</a>" +
		" <a class='btn btn-default btn-xs' href='/add?type=music&name=" + encodeName(artistName) + "%20" + encodeName(albumInfo.title) + "'</a>" +
			"<span class='glyphicon glyphicon-plus'></span>" +			
		"</a></p>";
	return item;
}

$(document).ready(function(){
	var artistId = getParameter("artistId");
	var artistName = getParameter("name");
	findAlbums(artistId, artistName);	
});