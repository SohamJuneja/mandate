import React from 'react'
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion'
import TL from './timeline.json'
import { Captions, FontLoader } from './ui'
import { S01, S02, S03, S04, S05, S06, S07, S08, S09, S11 } from './Scenes'

const MAP: Record<string, React.FC<{ vo: number; len: number }>> = { s01: S01, s02: S02, s03: S03, s04: S04, s05: S05, s06: S06, s07: S07, s08: S08, s09: S09, s11: S11 }

const Fade = ({ frames, children }: { frames: number; children: React.ReactNode }) => {
  const f = useCurrentFrame()
  const op = interpolate(f, [0, TL.xf], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  void frames
  return <AbsoluteFill style={{ opacity: op }}>{children}</AbsoluteFill>
}

export const Main = () => (
  <AbsoluteFill style={{ background: '#070B18' }}>
    <FontLoader />
    {TL.scenes.map((s) => {
      const Comp = MAP[s.id]
      const vo = (s.voStart - s.start) / TL.fps
      const len = s.frames / TL.fps
      return (
        <Sequence key={s.id} from={s.start} durationInFrames={s.frames}>
          <Fade frames={s.frames}>
            <Comp vo={vo} len={len} />
            <Captions id={s.id} voOffset={vo} />
          </Fade>
        </Sequence>
      )
    })}
  </AbsoluteFill>
)
