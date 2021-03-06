import os, re, sys, json, nltk
from pymongo import MongoClient 
from nltk import word_tokenize
from nltk.util import ngrams

if 'py_env' in os.environ:
	configFile = os.environ['py_env']
else:
	configFile = 'default'

with open('./config/' + configFile + '.json') as config_file:
	config = json.load(config_file)

conn = MongoClient(config['mongo']['host'], config['mongo']['port'])
db = getattr(conn, config['mongo']['db'])

# parse country name from parent
name = sys.argv[1]

# calculate frequency distances and persist to mongo collection
def freqDist(txt):
	
	tokenizer = nltk.RegexpTokenizer(r'[a-zA-Z0-9]{3,}')
	txt = tokenizer.tokenize(txt)
	tagged_tok = nltk.pos_tag(txt)
	
	# keep nouns (NN) and adjectives (JJ)
	filtered_tagged_tok = [w for w in tagged_tok if re.match(r'NN|JJ', w[1])]

	# calculate frequency distribution of unigrams
	#fd_uno = nltk.FreqDist(filtered_tagged_tok).most_common()
	
	# calculate frequency distribution of bigrams
	bgs = nltk.bigrams(filtered_tagged_tok)
	fd_bg = nltk.FreqDist(bgs).most_common()

	if len(fd_bg) > 0:
		print 'fd_bg generated with len:', len(fd_bg)
		#update = db.countries.update_one({"name":name}, {"$set" : { "fd_bg": fd_bg, "fd_uno": fd_uno }})
		db.countries.update_one({"name": name}, {"$set" : { "fd_bg": fd_bg }}) #, "fd_uno": [] }})

	else:
		db.countries.update_one({"name": name}, {"$set" : { "fd_bg": [] }}) #, "fd_uno": [] }})
		print "nada"

q = db.countries.find({"name": name})

found = False
for doc in q:
	try:
		doc.get('h2')[0].get('p')
	except:
		pass
	else:
		found = True
		txt = doc.get('h2')[0].get('p')

if found:
	freqDist(txt)
else:
	print 'nada'

#print name, config['mongo']['host'], config['mongo']['port'], config['mongo']['db'],  q.get('h2')



