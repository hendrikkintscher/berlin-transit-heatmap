import json,random,statistics as st,sys
med=st.median
def load(f): return [json.loads(l) for l in open(f)]
def spread(P,inner,outer,n,k):
  O=list(P[0]['allReps']); random.seed(2); res={}
  for o in O+['All maps']:
    rs=[]
    for _ in range(3000):
      s=random.sample(P,2*n)
      def e(g,x): return outer([inner(p['allReps'][x][:k]) for p in g])
      def E(g): return sum(e(g,x) for x in O) if o=='All maps' else e(g,o)
      a,b=E(s[:n]),E(s[n:]); rs.append(100*(a-b)/b)
    rs.sort(); res[o]=( (rs[int(.95*len(rs))]-rs[int(.05*len(rs))])/2, max(abs(rs[0]),abs(rs[-1])))
  return res
rows=[('today (3 reps, fastest; fastest of 3 runs)','old.jsonl',min,min,3,3),
('today probe, fastest of 5 runs','old.jsonl',min,min,5,3),
('today probe, median of 5 runs','old.jsonl',min,med,5,3),
('today probe, median of 7 runs','old.jsonl',min,med,7,3),
('warm-up pass, 3 reps fastest, fastest of 3 runs','new.jsonl',min,min,3,3),
('warm-up pass, 3 reps fastest, median of 5 runs','new.jsonl',min,med,5,3),
('warm-up pass, 5 reps fastest, median of 5 runs','new.jsonl',min,med,5,5),
('warm-up pass, 5 reps median, median of 5 runs','new.jsonl',med,med,5,5),
('warm-up pass, 5 reps fastest, fastest of 5 runs','new.jsonl',min,min,5,5),
('warm-up pass, 5 reps fastest, median of 7 runs','new.jsonl',min,med,7,5),
]
print('90% of A/A differences within ±x %, worst seen in ()')
for name,f,i,o,n,k in rows:
  r=spread(load(S+'/'+f),i,o,n,k) if False else spread(load(f),i,o,n,k)
  print(f"{name:52s}"+' | '.join(f"{v[0]:4.1f} ({v[1]:2.0f})" for v in r.values()))
