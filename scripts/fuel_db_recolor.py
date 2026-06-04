#!/usr/bin/env python3
"""One-time DB patch: recolor existing offers/packs/categories to the FUEL palette."""
import os
from pymongo import MongoClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path('/app/backend/.env'))
client = MongoClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]

BANNER_MAP = {
    '#E23744': '#15140F', '#D62300': '#15140F', '#267E3E': '#15140F',
    '#FF8732': '#26251D', '#FF9F0A': '#26251D', '#4CAF50': '#15140F',
    '#FF6B6B': '#26251D',
}
CAT_MAP = {
    'Protein': '#E2603F', 'Carb': '#D69A35', 'Fat': '#5E97B8',
    'Meal': '#15140F', 'Veg': '#3FA34D', 'Non-Veg': '#C0392B',
}

def patch_banner(coll):
    n = 0
    for doc in db[coll].find({}):
        bc = doc.get('banner_color')
        new = BANNER_MAP.get((bc or '').upper())
        if new and new != bc:
            db[coll].update_one({'_id': doc['_id']}, {'$set': {'banner_color': new}})
            n += 1
    return n

off = patch_banner('offers')
pks = patch_banner('packs')

cats = 0
for doc in db['categories'].find({}):
    new = CAT_MAP.get(doc.get('name'))
    if new and new != doc.get('color'):
        db['categories'].update_one({'_id': doc['_id']}, {'$set': {'color': new}})
        cats += 1

print(f"offers recolored: {off}; packs recolored: {pks}; categories recolored: {cats}")
print("offers banner_colors now:", [o.get('banner_color') for o in db.offers.find({}, {'banner_color': 1})])
print("category colors now:", [(c.get('name'), c.get('color')) for c in db.categories.find({}, {'name': 1, 'color': 1})])
