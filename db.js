var mongoose = require('mongoose')
var Schema = mongoose.Schema
var Promise = require('bluebird')
var exports = module.exports

var config = require('config')
var url = 'mongodb://' + config.get('mongo.host') + ':' + config.get('mongo.port') + '/' + config.get('mongo.db')

mongoose.connect(url, function(err) {
	if (err) throw (err)
})

var h2_Schema = new Schema({ title: String, p: String }, { noId: true });
var edgeList_Schema = new Schema({ country: String, dist: Number }, { noId: true });

var Country = new Schema({
	num: { type: Number, required : true }, //unique: true
	name: { type: String, required : true }, //unique: true
	url: String,
	flag: String,
	create_date: { type: Date, default: Date.now },
	h3: Array,
	h2: [h2_Schema],
	fd_bg: Array,
	fd_uno: Array,
	edges: [edgeList_Schema],
	latlong: {
		url: String, 	
		lat : Number,
		lon : Number
	},
	gdp: { type: Number, default: 0 },
	pop:  { type: Number, default: 0 },

})

var Country = mongoose.model('Country', Country)

exports.create_country = function(country) {
		return function() {
			return new Promise( function(res, rej) {
				Country.create({num: country.num, name: country.name, url: country.url}, function(err, db_country) {
					if (err) {rej(err)}
					else {
						console.log({num: country.num, name: country.name, url: country.url}, 'was persisted to db')
						res(country)
					}

				})
			})
		}
}

exports.getCountryInfo = function(title) {
	
	return new Promise(function(res, rej) { 
	
		Country.findOne({name: title}, function(err, c) {
			console.log('getCountryInfo', c.name, c.flag.slice(-20))

			if (err) { rej(err) }
			if (c) {
				//console.log('get country info', {type: 'node', name: c.name, img: c.flag})
				res({type: 'node', name: c.name, img: c.flag})
			} else { rej('Can\'t find country') }
		})

	})

}

exports.checkIfFreqDist = function(country) {
	return new Promise(function(res, rej) {
		console.log('checkIfFreqDist', country)

		Country.findOne({name: country.name}, function(err, c) {
			if (err) { rej(err) }
			if (c) {
				console.log(country.name+'\'s fd_bg.length is '+c.fd_bg.length)
				
				if (c.fd_bg.length > 0) {
					country['fd_bg'] = true
				} else { 
					country['fd_bg'] = false
				}
			}
			res(country)
		})
	})
}

exports.checkIfCrawledAlready = function(countryList) {
	
	return new Promise(function(res, rej) { 

		//  c: list containing already crawled country names
		// nc: list containing non-crawled country names 
		ret = {c: [], nc: []}
	
		countryList.forEach(function(country, i, arr) {
			console.log('checkIfCrawledAlready', country, i)
			Country.findOne({name: country}, function(err, c) {
				if (err) { rej(err) }
				if (c) {
					if (c.h2[0].p.length > 0)  {
						console.log('checkIfCrawledAlready c.h2[0].p.length > 0')
						ret.c.push(country)	
					} else { ret.nc.push(country) }
				} else { ret.nc.push(country) }

				if (i == arr.length-1) res(ret)
			})
		})
	})

}

exports.checkIfLink = function(country, otherCountry) {

	return new Promise(function(res, rej) {
		
		console.log("checkIfLink", country, otherCountry)
		_checkIfLink(country, otherCountry)
			.then(function(AB) {
				console.log('AB', AB)
				if (AB.err) Promise.reject(AB.err)
				if (!AB.ret) {
					console.log('!AB.ret')
					return _checkIfLink(otherCountry, country)
				} else {
					return Promise.resolve({err: null, ret:AB.ret})
				}
			})
			.then(function(BA) {
				console.log('BA', BA)
				if (BA.err) Promise.reject(BA.err)
				if (!BA.ret) { 
					console.log('!BA.ret')
					res(null) 
				} else {
					res({ type: "link", source: country, target: otherCountry, "dist" : BA.ret }) 
				}
			})
			.catch(function(e) {
				rej(e)
			})

	})
}

/*
checkIfLink('Japan', 'Japan')
	.then(function(c) {
		console.log('test checkIfLink', c)
	})
	.catch(function(e) {
		console.log('test checkIfLink err', e)
	})
*/
function _checkIfLink(country, otherCountry) {
	console.log('_checkIfLink', country, otherCountry)
	return new Promise(function(res, rej) {
		Country.findOne({name: country}, function(err, c) {
				if (err) { res({ err: err, ret: null}) }
				if (c) {
					//console.log(country, '\'s edges:', c.edges)
					var foundEdge = findEdge(otherCountry, c.edges)
					if (foundEdge) {
						console.log('_checkIfLink found edge', { type: "link", source: country, target: otherCountry, "dist" : foundEdge})
						res({ err: null, ret: foundEdge })
					} else {
						console.log('_checkIfLink !foundEdge)', { err: null, ret: null }) 
						res({ err: null, ret: null })
					}
				} else {
					console.log('_checkIfLink !c', { err: null, ret: null }) 
					res({ err: null, ret: null })
				}
		})
	})
}

function findEdge(c, edges) {
	console.log('findEdge', c, edges)
	for (i in edges) { 
		if (c === edges[i].country && !isNaN(edges[i].dist)) {
			return edges[i].dist
		}
	}
	return false
}

exports.update_country = function (cond, update, callback) {

    var condition = {name: cond}
    var options = null

    Country.findOneAndUpdate(condition, update, options, callback)
}