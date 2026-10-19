"""Art-interface regression checks: timelines, intro seams, edge clipping, tool contact, theme identity,
ordered ramps, and the page's exact walker foot-lock algorithm. Prints a JSON report; writes nothing.
Usage (repo root): python art/sprites/validate_motion.py
"""
import json
import os
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build  # noqa: E402
import pal  # noqa: E402

def steps(frames):
    feet=[{x for x,c in enumerate(f[-1]) if c!='.'} for f in frames]
    result=[]
    for a,b in zip(feet,feet[1:]+feet[:1]):
        scores=[sum(x-d in b for x in a) for d in range(5)]
        result.append(scores.index(max(scores)))
    return result

def check(S):
    errors=build.validate(S)
    durations={}
    for fam,sizes in S['anims'].items():
        durations[fam]={}
        for size,states in sizes.items():
            durations[fam][size]={}
            for state,a in states.items():
                if state=='vars': continue
                label=f'{fam}/{size}/{state}'
                durations[fam][size][state]=round(len(a['frames'])/a['fps'],3)
                if not 0<=a['key']<len(a['frames']): errors.append(label+' invalid key')
                if a['loop'] and len(a['frames'])/a['fps']<10: errors.append(label+' loop too short')
                if a.get('next') and a['frames'][-1]!=states[a['next']]['frames'][0]: errors.append(label+' intro seam')
                for i,fr in enumerate(a['frames']):
                    # No cut head/hand on any of the four image edges.
                    if any(r[0]!='.' or r[-1]!='.' for r in fr): errors.append(label+f' horizontal clip {i}')
                    if fr[-1].strip('.'): errors.append(label+f' bottom clip {i}')
            # variants: same length as the base, land exactly on the base frame 0 at both ends, close the
            # 60-frame secondary wave (agy) and never end mid ahoge/cable rebound
            for st,keys in states['vars'].items():
                b=states[st]
                for vk in keys[1:]:
                    v=states[vk]; n=len(v['frames'])
                    if n!=len(b['frames']) or v['fps']!=b['fps']: errors.append(f'{fam}/{size}/{vk} length/fps differs from base')
                    if v['frames'][0]!=b['frames'][0]: errors.append(f'{fam}/{size}/{vk} start seam')
                    if v['frames'][-1]!=b['frames'][0]: errors.append(f'{fam}/{size}/{vk} end seam')
                    if n%60: errors.append(f'{fam}/{size}/{vk} secondary wave not closed ({n} % 60)')
                    if not 0<=v['key']<n: errors.append(f'{fam}/{size}/{vk} invalid key')
            if size=='lead':
                a=states['tool']
                if a['frames'][a['key']][38][42] not in '2345': errors.append(f'{fam}: tool lost fixed (42,38) contact')
    # Skin/hair/eyes invariant across theme variants; fabric ramps remain ordered in perceptual lightness.
    for fam in pal.FAMS:
        base=S['palettes']['claude'][fam]
        for theme in pal.THEMES:
            p=S['palettes'][theme][fam]
            if base[2:15]!=p[2:15]: errors.append(f'{theme}/{fam}: identity colours drifted')
            for ramp in ('fghij','klmn','opq'):
                light=[pal.to_oklch(p[build.IDX.index(c)])[0] for c in ramp]
                if any(a>=b for a,b in zip(light,light[1:])): errors.append(f'{theme}/{fam}: unordered {ramp}')
    walker=S['walker']; travel={}
    for name,anims in [('a',walker['anims'])]+[(v['name'],v['anims']) for v in walker['variants']]:
        a=anims['walk']; d=steps(a['frames']); travel[name]=d
        if d!=[1]*12: errors.append(f'walker {name}: inferred travel {d}')
        # Follow the same physical foot across each support half-cycle: world coordinate stays fixed.
        for start in (0,6):
            world=[sum(d[:i])+11-i%6 for i in range(start,start+6)]
            if len(set(world))!=1: errors.append(f'walker {name}: stance foot slides')
    report=dict(errors=sorted(set(errors)),durations_seconds=durations,walker_steps_px=travel,
                checks=['dimensions/palettes/headroom','all edges unclipped','60 state timelines',
                        'intro to loop exact landing','variant seams on the base frame 0','fixed tool contact (42,38)',
                        'theme identity and monotonic ramps','page-equivalent walker travel and planted-foot lock'])
    print(json.dumps(report['errors'],ensure_ascii=True))
    print('Timeline seconds:',json.dumps(durations['claude']))
    print('Walker:',travel)
    print('PASS' if not report['errors'] else 'FAIL')
    return errors

if __name__=='__main__':
    raise SystemExit(bool(check(build.build())))
