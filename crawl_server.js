const debug = require('debug')('countrygraph')    
var Crawler = require("crawler")
var Promise = require('bluebird')
var config = require('config')
var wc = require('./word_counter.js')
var db = require('./db.js')

const list_countries_url = 'https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_area'
const source_url = 'https://en.wikipedia.org'

var emittedCountries = []

module.exports = function(httpServer) {

        var io = require('socket.io')(httpServer)
        io.sockets.on('connection', function(socket) {
		  
            socket.on('c', function(data) {
                if (Array.isArray(data) && data.length) {
                    debug('socket on c', data)
                    emittedCountries.length = 0

                    db.checkIfCrawledAlready(data)
                        .then(function(countryList) {
                            
                            debug("checkedIfCrawled list", countryList)
                            if (countryList.c.length) noCrawl(socket, countryList)
                            if (countryList.nc.length) Crawl(socket, countryList)

                        })
                        .catch(function(e) { debug(e) })

                }
            })
          
        })

}

var r = Promise.resolve()
var sessionCountries = {}


// Already crawled
function noCrawl(socket, countryList) {

    debug('noCrawl', countryList.c)

    countryList.c.forEach(function(name) {

        debug('noCrawl forEach', name)
        r = r
            .then(function() {
                return db.getCountryInfo(name) 
            })
            .then(function(c) {
                return new Promise(function(res, rej) { 
                    debug('Crawl: graph node about to be emitted: ', c)
                    socket.emit('crawl', c)
                    emittedCountries.push(c.name)
                    res( { name: c.name } )
                })
            })
            .then(db.checkIfFreqDist)
            .then(function(c) { 
                if (!c.fd_bg) {
                    debug('c.fd_bg', c.fd_bg, 'return wc.py_freqDist(c)')
                    return wc.py_freqDist(c)
                } else {
                    debug('c.fd_bg', c.fd_bg, 'do not return wc.py_freqDist(c)')
                    return Promise.resolve(c)
                }
            })
            .then(function(c) {
                // copy current list of emitted nodes
                var compareArray = emittedCountries.slice()
                // remove current country from list
                compareArray.splice(compareArray.indexOf(c.name), 1)
                debug(c.name+'\'s compareArray', compareArray)

                if (compareArray.length) return compare(socket, c.name, compareArray)            
                else return Promise.resolve()
            })
            .catch(function(e) { debug("noCrawl error", e) })
    })

    return r

}


var c = new Crawler({
    maxConnections : 10,
    rateLimits: 0
})

/* The first crawl queue finds the wikipedia pages of all countries listed in country_list 
on the list_countries_url page and persists the data to the `countries` collection */
function Crawl(socket, countryList) {   

    debug('Crawl', countryList.nc)
    
    c.queue({
        uri: list_countries_url,
        callback: function (error, result, $) {
            if (error) {throw (error)}
            var count = 0
            
            function Qs() {
                $('.flagicon+ a')
                    .each(function(i, a) {
                
                        var title = $(a).attr('title')

                        //debug("$('.flagicon+ a').each", countryList, title)

                        
                        if (!isInArray(title, countryList.nc)) { 
                            //debug(title, countryList))
                            return 
                        
                        } else {
                            
                            debug('found '+title+' in wikipedia page to crawl')
                            country = { name : title,
                                        url: source_url+$(a).attr('href'),
                                       }
                            
                            r = r
                                .then(db.create_country(country))
                                .then(function(country) {
                                    return secondQueue(country, socket)
                                })
                                .then(wc.py_freqDist)
                                .then(function(c) {
                                    // copy current list of emitted nodes
                                    var compareArray = emittedCountries.slice()
                                    // remove current country from list
                                    compareArray.splice(compareArray.indexOf(c.name), 1)
                                    debug(c.name+'\'s compareArray', compareArray)

                                    if (compareArray.length) return compare(socket, c.name, compareArray)            
                                    else return Promise.resolve()
                                })
                                .catch(function(e) { debug("Crawl error",e) })
                        }
                })   
                return r
            }
            Qs()        
        }
    })
    socket.on('disconnect', function() {
    debug('client disconnected whilst in first queue')
  })

}

/* The second crawl queue looks for country flag images' href and <p> tag content under <h2> 
containing the token "history" and persists the data to the `countries` collection */
function secondQueue(country, socket) {

    debug("Crawl secondQueue", country.name) 
    
    return new Promise( function(res, rej) {

        c.queue({
            
            uri: country.url,
            callback: function (error, result, $) {
                
                if (error) rej("secondQeue " + error)

                if ($('table.infobox').eq(0).find('img').attr('src')) {
                    var img_url = $('table.infobox').eq(0).find('img').attr('src')
                    country['flag'] = img_url.slice(2)
                }
                
                //emit vertex data, edges will be caclulate at next step
                var node = {type: 'node', name: country.name, img: country.flag}
                debug('secondQeue: graph node about to be emitted: ', node)
                socket.emit('crawl', node)
                emittedCountries.push(country.name)

                db.update_country(country.name, 
                    {$push: 
                        {"h2": 
                            { 
                            "title": $("h2:contains('History')").text(),
                            "p": $("h2:contains('History')").nextUntil($('h2'), 'p').text()
                            }
                        },
                     "flag": country.flag
                    },
                    function(err) { if (err) rej(err) })

                res(country)

                }
            })
        })
}


function compare(socket, country, countries) {
    debug('compare', country, countries)

    r = Promise.resolve()
    return new Promise(function(res, rej) {

        countries.forEach(function(otherCountry, i, arr) {
            debug('compare countries forEach', otherCountry)
            
            r = r
                .then(function() {
                    return db.checkIfLink(country, otherCountry)
                })
                .then(function(c) {
                    if (!c) {
                        debug('no link between', country, 'and', otherCountry, 'engaging wc.py_compare_freqDist')
                        return wc.py_compare_freqDist(country, otherCountry)
                    } else {
                        debug('found link between', country, 'and', otherCountry, 'with bg_dist', c.dist)
                        return Promise.resolve(c)
                    }
                }) 
                .then(function(c) {
                    return new Promise(function(res, rej) {   
                        debug('Compare about to emit', c)
                        socket.emit('crawl', c)
                        res()
                    })
                })
                .catch(function(e) { rej(e) })

            if (i == arr.length-1) res()
        
        })

        return r

    })
}

function isInArray(value, array) {
  return array.indexOf(value) > -1;
}

