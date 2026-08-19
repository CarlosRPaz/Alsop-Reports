import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from src.spine import Spine

config = json.load(open('config/config.json'))
s = Spine.from_supabase(config, excluded_agents=['Teyssy', 'Elizabeth'])
print(f'Loaded {len(s.agent_names())} agents from Supabase')
print()

# Test resolution with various name formats
tests = [
    'Eddie Martinez',        # Full name (rc_name)
    'EDDIE MARTINEZ',        # Uppercase (hs_name)
    '387-ALEX CLANCY',       # NB sub-producer format
    'Alex Clancy',           # RC name
    'Alex',                  # Canonical nickname
    'Some Unknown Person',   # Should return None
]
for t in tests:
    result = s.resolve_agent(t)
    print(f'  resolve("{t}") -> {result}')
