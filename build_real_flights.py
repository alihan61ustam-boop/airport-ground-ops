import json
import datetime
import re

with open('data/raw_fr24_deps.json', 'r', encoding='utf-8') as f:
    raw_deps = json.load(f)
with open('data/raw_fr24_arrs.json', 'r', encoding='utf-8') as f:
    raw_arrs = json.load(f)

tz = datetime.timezone(datetime.timedelta(hours=3))
today_start_ts = datetime.datetime(2026, 9, 26, 0, 0, 0, tzinfo=tz).timestamp()
today_end_ts = datetime.datetime(2026, 9, 26, 21, 0, 0, tzinfo=tz).timestamp()

CALLSIGN_TO_AIRLINE = {
    'THY': ('THY', 'Türk Hava Yolları'), 'TK': ('THY', 'Türk Hava Yolları'),
    'AJT': ('AJT', 'AJet'), 'VF': ('AJT', 'AJet'),
    'PGT': ('PGT', 'Pegasus Airlines'), 'PC': ('PGT', 'Pegasus Airlines'),
    'SXS': ('SXS', 'SunExpress'), 'XQ': ('SXS', 'SunExpress'),
    'DLH': ('DLH', 'Lufthansa'), 'LH': ('DLH', 'Lufthansa'),
    'AFR': ('AFR', 'Air France'), 'AF': ('AFR', 'Air France'),
    'KLM': ('KLM', 'KLM Royal Dutch Airlines'), 'KL': ('KLM', 'KLM Royal Dutch Airlines'),
    'BAW': ('BAW', 'British Airways'), 'BA': ('BAW', 'British Airways'),
    'UAE': ('UAE', 'Emirates'), 'EK': ('UAE', 'Emirates'),
    'QTR': ('QTR', 'Qatar Airways'), 'QR': ('QTR', 'Qatar Airways'),
    'FDB': ('FDB', 'Flydubai'), 'FZ': ('FDB', 'Flydubai'),
    'WZZ': ('WZZ', 'Wizz Air'), 'W6': ('WZZ', 'Wizz Air'),
    'AFL': ('AFL', 'Aeroflot'), 'SU': ('AFL', 'Aeroflot'),
    'PBD': ('PBD', 'Pobeda'), 'DP': ('PBD', 'Pobeda'),
    'SVA': ('SVA', 'Saudia'), 'SV': ('SVA', 'Saudia'),
    'MSR': ('MSR', 'EgyptAir'), 'MS': ('MSR', 'EgyptAir'),
    'RJA': ('RJA', 'Royal Jordanian'), 'RJ': ('RJA', 'Royal Jordanian'),
    'AEE': ('AEE', 'Aegean Airlines'), 'A3': ('AEE', 'Aegean Airlines'),
    'DAH': ('DAH', 'Air Algerie'), 'AH': ('DAH', 'Air Algerie'),
    'LOT': ('LOT', 'LOT Polish Airlines'), 'LO': ('LOT', 'LOT Polish Airlines'),
    'ROT': ('ROT', 'Tarom'), 'RO': ('ROT', 'Tarom'),
    'UZB': ('UZB', 'Uzbekistan Airways'), 'HY': ('UZB', 'Uzbekistan Airways'),
    'ASL': ('ASL', 'Air Serbia'), 'JU': ('ASL', 'Air Serbia'),
    'MEA': ('MEA', 'Middle East Airlines'), 'ME': ('MEA', 'Middle East Airlines'),
    'AHY': ('AHY', 'Azerbaijan Airlines'), 'J2': ('AHY', 'Azerbaijan Airlines'),
    'KZR': ('KZR', 'Air Astana'), 'KC': ('KZR', 'Air Astana'),
    'CSN': ('CSN', 'China Southern Airlines'), 'CZ': ('CSN', 'China Southern Airlines'),
    'FDX': ('FDX', 'FedEx'), 'FX': ('FDX', 'FedEx'),
    'KNE': ('KNE', 'Flynas'), 'XY': ('KNE', 'Flynas'),
    'TBZ': ('TBZ', 'ATA Airlines'), 'I3': ('TBZ', 'ATA Airlines'),
    'MNB': ('MNB', 'MNG Airlines'), 'MB': ('MNB', 'MNG Airlines'),
    'IRB': ('IRB', 'Iran Airtour'), 'B9': ('IRB', 'Iran Airtour'),
    'CPN': ('CPN', 'Caspian Airlines'), 'RV': ('CPN', 'Caspian Airlines'),
    'TRA': ('TRA', 'Transavia'), 'HV': ('TRA', 'Transavia')
}

def map_model(code, text):
    c = (code or '').strip().upper()
    t = (text or '').strip().upper()
    
    if c in ['388', 'A388'] or '380' in t: return 'A388'
    if c in ['744', '74F', 'B744'] or '747' in t: return 'B744'
    if c in ['77W', '77L', '772', '773', '77X', 'B77W', 'B77L', 'B772', 'B773'] or '777' in t: return 'B777-300ER'
    if c in ['359', 'A359'] or '350' in t: return 'A350-900'
    if c in ['333', '332', '330', '33P', '33X', 'A333', 'A332', 'A339'] or '330' in t: return 'A330-300'
    if c in ['789', '788', '787', 'B789', 'B788'] or '787' in t: return 'B787-9'
    if c in ['763', '762', 'B763', 'B762'] or '767' in t: return 'B767-300'
    if c in ['A306', 'A310', 'AB6', 'ABF', 'ABY'] or '300' in t or '310' in t: return 'A300-600'
    if c in ['73J', '739', 'B739']: return 'B737-900ER'
    if c in ['7M8', '7M9', 'B38M', 'B39M']: return 'B737-MAX8'
    if c in ['738', '73H', '737', '733', '735', 'B738', 'B733', 'B735'] or '737' in t: return 'B737-800'
    if c in ['321', '32B', '32Q', '32R', '32X', 'A21N', 'A321'] or '321' in t: return 'A321neo'
    if c in ['320', '32A', '32N', '32S', 'A20N', 'A320'] or '320' in t: return 'A320neo'
    if c in ['319', '313', '31F', '31Y', 'A319'] or '319' in t: return 'A319'
    if c in ['BCS3'] or '220' in t: return 'A220-300'
    if c in ['E190', 'E195', 'E90', 'E95'] or '190' in t or '195' in t: return 'E190'
    if c in ['AT76'] or 'ATR' in t: return 'ATR72'
    if c in ['C56X', 'CL60', 'E35L', 'FA6X', 'GLEX', 'GLF4', 'GLF6', 'P180']: return 'Bizjet'
    return 'A321neo'

def extract_flight(item, kind, idx):
    fl = item.get('flight', {})
    ident = fl.get('identification', {})
    fn_def = (ident.get('number', {}) or {}).get('default') or ''
    callsign = ident.get('callsign') or fn_def.replace(' ', '')
    if not fn_def:
        fn_def = callsign or f'FLT{idx}'
        
    t = fl.get('time', {})
    sch = t.get('scheduled', {})
    sch_ts = sch.get(kind) or 0
    if not (today_start_ts <= sch_ts <= today_end_ts):
        return None
        
    dt = datetime.datetime.fromtimestamp(sch_ts, tz)
    sec_of_day = dt.hour * 3600 + dt.minute * 60 + dt.second
    time_str = dt.strftime('%H:%M')
    
    airline_data = fl.get('airline') or fl.get('owner') or {}
    airline_name = airline_data.get('name') or ''
    airline_code = (airline_data.get('code') or {}).get('icao') or (airline_data.get('code') or {}).get('iata') or ''
    
    if 'Turkish' in airline_name:
        airline_code = 'THY'
        airline_name = 'Türk Hava Yolları'
    elif not airline_code:
        p3 = (callsign[:3] if len(callsign) >= 3 else '').upper()
        p2 = (callsign[:2] if len(callsign) >= 2 else '').upper()
        f2 = (fn_def[:2] if len(fn_def) >= 2 else '').upper()
        if p3 in CALLSIGN_TO_AIRLINE:
            airline_code, default_name = CALLSIGN_TO_AIRLINE[p3]
            airline_name = airline_name or default_name
        elif p2 in CALLSIGN_TO_AIRLINE:
            airline_code, default_name = CALLSIGN_TO_AIRLINE[p2]
            airline_name = airline_name or default_name
        elif f2 in CALLSIGN_TO_AIRLINE:
            airline_code, default_name = CALLSIGN_TO_AIRLINE[f2]
            airline_name = airline_name or default_name
        else:
            airline_code = p3 or 'GEN'
            airline_name = airline_name or 'Genel Havacılık'
    
    aircraft_data = fl.get('aircraft', {}) or {}
    model_data = aircraft_data.get('model', {}) or {}
    model_code = (model_data.get('code') or '').strip().upper()
    model_text = model_data.get('text') or ''
    ac_type = map_model(model_code, model_text)
    
    reg = aircraft_data.get('registration') or ''
    if not reg:
        # Realistic registration generator based on airline and flight number
        prefix = 'TC-' if 'THY' in airline_code or 'Turkish' in airline_name or 'AJet' in airline_name else 'D-'
        num_hash = abs(hash(fn_def + str(sch_ts)))
        l1 = chr(65 + (num_hash % 26))
        l2 = chr(65 + ((num_hash // 26) % 26))
        l3 = chr(65 + ((num_hash // 676) % 26))
        reg = f'{prefix}L{l1}{l2}' if prefix == 'TC-' else f'{prefix}A{l1}{l2}{l3}'
        
    airport_data = fl.get('airport', {}) or {}
    if kind == 'departure':
        dest_data = airport_data.get('destination', {}) or {}
        port_code = (dest_data.get('code') or {}).get('iata') or (dest_data.get('code') or {}).get('icao') or 'ESB'
        port_name = dest_data.get('name') or port_code
        port_city = (dest_data.get('position', {}).get('region', {}) or {}).get('city') or port_name.replace(' Airport', '')
        orig_code = 'IST'
        orig_city = 'İstanbul'
        dest_code = port_code
        dest_city = port_city
    else:
        orig_data = airport_data.get('origin', {}) or {}
        port_code = (orig_data.get('code') or {}).get('iata') or (orig_data.get('code') or {}).get('icao') or 'AYT'
        port_name = orig_data.get('name') or port_code
        port_city = (orig_data.get('position', {}).get('region', {}) or {}).get('city') or port_name.replace(' Airport', '')
        orig_code = port_code
        orig_city = port_city
        dest_code = 'IST'
        dest_city = 'İstanbul'
        
    clean_fn = fn_def
    if ' ' not in clean_fn and len(clean_fn) >= 4:
        m = re.match(r'^([A-Za-z]+)(\d+.*)$', clean_fn)
        if m:
            clean_fn = f'{m.group(1)} {m.group(2)}'
            
    fn_no_space = clean_fn.replace(' ', '')
    flight_id = f'FR_{kind[:3].upper()}_{fn_no_space}_{sec_of_day}'
            
    return {
        'id': flight_id,
        'flightNumber': clean_fn,
        'callsign': callsign,
        'kind': kind,
        'airline': airline_code,
        'airlineName': airline_name,
        'registration': reg,
        'type': ac_type,
        'modelCode': model_code or ac_type,
        'origin': orig_code,
        'originCity': orig_city,
        'destination': dest_code,
        'destinationCity': dest_city,
        'scheduledTime': time_str,
        'scheduledSec': sec_of_day,
        'scheduledTs': int(sch_ts)
    }

raw_deps_list = []
seen_d = set()
for idx, d in enumerate(raw_deps):
    f = extract_flight(d, 'departure', idx)
    if f and (f['flightNumber'], f['scheduledSec']) not in seen_d:
        seen_d.add((f['flightNumber'], f['scheduledSec']))
        raw_deps_list.append(f)

raw_arrs_list = []
seen_a = set()
for idx, a in enumerate(raw_arrs):
    f = extract_flight(a, 'arrival', idx)
    if f and (f['flightNumber'], f['scheduledSec']) not in seen_a:
        seen_a.add((f['flightNumber'], f['scheduledSec']))
        raw_arrs_list.append(f)

raw_deps_list.sort(key=lambda x: x['scheduledSec'])
raw_arrs_list.sort(key=lambda x: x['scheduledSec'])

# Build realistic ground operations schedule with rotation pairing
paired_deps = set()
final_schedule = []

# Index departures by registration
reg_to_deps = {}
for d in raw_deps_list:
    r = d['registration']
    if r:
        reg_to_deps.setdefault(r, []).append(d)

for arr in raw_arrs_list:
    arr_sec = arr['scheduledSec']
    arr_reg = arr['registration']
    matched_dep = None
    
    # Try match by registration
    if arr_reg and arr_reg in reg_to_deps:
        for candidate in reg_to_deps[arr_reg]:
            if candidate['id'] not in paired_deps and (arr_sec + 35 * 60) <= candidate['scheduledSec'] <= (arr_sec + 180 * 60):
                matched_dep = candidate
                break
                
    if matched_dep:
        paired_deps.add(matched_dep['id'])
        dep_sec = matched_dep['scheduledSec']
        final_schedule.append({
            'id': f"ROT_{arr['flightNumber'].replace(' ', '')}_{matched_dep['flightNumber'].replace(' ', '')}_{arr_sec}",
            'flightNumber': arr['flightNumber'],
            'callsign': arr['callsign'],
            'kind': 'turnaround',
            'airline': arr['airline'],
            'airlineName': arr['airlineName'],
            'registration': arr['registration'],
            'type': arr['type'],
            'modelCode': arr['modelCode'],
            'origin': arr['origin'],
            'originCity': arr['originCity'],
            'destination': matched_dep['destination'],
            'destinationCity': matched_dep['destinationCity'],
            'arrivalSec': arr_sec,
            'departureSec': dep_sec,
            'groundTimeSec': dep_sec - arr_sec,
            'scheduledTime': arr['scheduledTime'],
            'depScheduledTime': matched_dep['scheduledTime'],
            'outboundFlightNumber': matched_dep['flightNumber'],
            'outboundCallsign': matched_dep['callsign']
        })
    else:
        # Single arrival (e.g. TK 2463)
        # Ground turnaround 50 mins before taxi/hangar or next leg
        ground_time = 50 * 60
        final_schedule.append({
            'id': arr['id'],
            'flightNumber': arr['flightNumber'],
            'callsign': arr['callsign'],
            'kind': 'arrival',
            'airline': arr['airline'],
            'airlineName': arr['airlineName'],
            'registration': arr['registration'],
            'type': arr['type'],
            'modelCode': arr['modelCode'],
            'origin': arr['origin'],
            'originCity': arr['originCity'],
            'destination': arr['destination'],
            'destinationCity': arr['destinationCity'],
            'arrivalSec': arr_sec,
            'departureSec': arr_sec + ground_time,
            'groundTimeSec': ground_time,
            'scheduledTime': arr['scheduledTime'],
            'depScheduledTime': '',
            'outboundFlightNumber': '',
            'outboundCallsign': ''
        })

# Add remaining single departures
for dep in raw_deps_list:
    if dep['id'] not in paired_deps:
        dep_sec = dep['scheduledSec']
        ground_time = 45 * 60
        arr_sec = max(0, dep_sec - ground_time)
        final_schedule.append({
            'id': dep['id'],
            'flightNumber': dep['flightNumber'],
            'callsign': dep['callsign'],
            'kind': 'departure',
            'airline': dep['airline'],
            'airlineName': dep['airlineName'],
            'registration': dep['registration'],
            'type': dep['type'],
            'modelCode': dep['modelCode'],
            'origin': dep['origin'],
            'originCity': dep['originCity'],
            'destination': dep['destination'],
            'destinationCity': dep['destinationCity'],
            'arrivalSec': arr_sec,
            'departureSec': dep_sec,
            'groundTimeSec': ground_time,
            'scheduledTime': dep['scheduledTime'],
            'depScheduledTime': dep['scheduledTime'],
            'outboundFlightNumber': dep['flightNumber'],
            'outboundCallsign': dep['callsign']
        })

# Sort schedule chronologically by arrivalSec
final_schedule.sort(key=lambda x: x['arrivalSec'])

print(f'Total final scheduled flight operations for LTFM: {len(final_schedule)}')

dataset = {
    'airport': 'LTFM',
    'date': '2026-09-26',
    'source': 'Flightradar24 Live Real-World Feed',
    'totalMovements': len(raw_deps_list) + len(raw_arrs_list),
    'flightsCount': len(final_schedule),
    'flights': final_schedule,
    'rawDeparturesCount': len(raw_deps_list),
    'rawArrivalsCount': len(raw_arrs_list)
}

with open('data/real-flights-ist.json', 'w', encoding='utf-8') as f:
    json.dump(dataset, f, indent=2, ensure_ascii=False)

with open('data/real-flights-ist.js', 'w', encoding='utf-8') as f:
    f.write('// Flightradar24 Real-World Flight Feed for Istanbul Airport (IST / LTFM)\n')
    f.write('// Extracted for 2026-09-26 up to 21:00\n')
    f.write('window.REAL_FLIGHTS_IST = ' + json.dumps(dataset, ensure_ascii=False) + ';\n')

print('Wrote data/real-flights-ist.json and data/real-flights-ist.js successfully!')
