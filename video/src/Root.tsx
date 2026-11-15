import React from 'react'
import { Composition } from 'remotion'
import TL from './timeline.json'
import { Main } from './Main'
import { Logo, FontLoader } from './ui'
import { AbsoluteFill } from 'remotion'

const Thumb = () => (
  <AbsoluteFill style={{ background: 'radial-gradient(900px 600px at 30% 20%, #13224A 0%, #0B1530 45%, #070B18 100%)', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', fontFamily: "'Inter', sans-serif", color: '#fff' }}>
    <FontLoader />
    <Logo size={190} />
    <div style={{ fontWeight: 900, fontSize: 104, letterSpacing: -4, marginTop: 8 }}>Mandate</div>
    <div style={{ fontSize: 40, fontWeight: 600 }}>Let agents trade. <span style={{ color: '#2EE6A6' }}>Inside the lines.</span></div>
  </AbsoluteFill>
)

export const Root = () => (
  <>
    <Composition id="Mandate" component={Main} durationInFrames={TL.total} fps={TL.fps} width={1920} height={1080} />
    <Composition id="Thumb" component={Thumb} durationInFrames={1} fps={30} width={1280} height={720} />
  </>
)
