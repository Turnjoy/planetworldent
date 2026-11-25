import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDown, ArrowRight, Check, ChevronDown, Copy, Flame, MapPin, Menu, Minus, Music2, Phone, Plus, QrCode, Sparkles, Ticket, Waves, X, Zap, MessageCircle, LoaderCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import './index.css';
import './passes.css';
import './refinements.css';
import './mobile-first.css';

const InstagramGlyph = ({size=17}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none"/></svg>;
const WhatsAppGlyph = ({size=17}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.3 11.7a8.2 8.2 0 0 1-12.1 7.2L4 20l1.1-4a8.2 8.2 0 1 1 15.2-4.3Z"/><path d="M8.7 8.1c.2-.5.5-.5.8-.5h.5c.2 0 .4.1.5.4l.7 1.7c.1.3.1.5-.1.7l-.5.6c-.2.2-.2.4 0 .7.3.6 1 1.3 1.6 1.7.6.4.9.5 1.2.2l.7-.8c.2-.2.4-.3.7-.2l1.6.8c.3.1.4.3.4.5 0 .4-.2 1.2-.8 1.6-.5.4-1.1.6-1.8.4-1-.2-2.3-.9-3.7-2.1-1.2-1.1-2.1-2.5-2.3-3.4-.2-.8.1-1.6.5-2.1Z"/></svg>;
const TikTokGlyph = ({size=17}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.4 7.1a6.3 6.3 0 0 1-4-2.7V15a5.2 5.2 0 1 1-5.2-5.2c.4 0 .9.1 1.3.2v3a2.4 2.4 0 1 0 1.7 2.3V2h3a6.3 6.3 0 0 0 3.2 3.3v1.8Z"/></svg>;
const SOCIALS = [
  { label: 'WhatsApp', href: 'https://wa.me/2349157428112?text=Hello%20Plannet%20World%20Entertainment!%20I%20have%20a%20question%20about%20Soakers%20Splash%20Squad%202027%20tickets.', Icon: WhatsAppGlyph },
  { label: 'Call', href: 'tel:07057642817', Icon: Phone },
  { label: 'TikTok', href: import.meta.env.VITE_ORGANIZER_TIKTOK_URL || 'https://www.tiktok.com/@ibukun_oluwa70', Icon: TikTokGlyph },
  { label: 'Instagram', href: import.meta.env.VITE_ORGANIZER_INSTAGRAM_URL || 'https://www.instagram.com/ibukun_oluwa70/', Icon: InstagramGlyph },
];
const money = (n) => `₦${n.toLocaleString('en-NG')}`;
const target = new Date('2027-01-01T22:00:00+01:00').getTime();

function App() {
  const [remaining, setRemaining] = useState(184);
  const [qty, setQty] = useState(1);
  const [tier, setTier] = useState('early');
  const [clock, setClock] = useState(Date.now());
  const [faq, setFaq] = useState(0);
  const [copied, setCopied] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [passOpen, setPassOpen] = useState(false);
  const [passEmail, setPassEmail] = useState('');
  const [passReference, setPassReference] = useState(new URLSearchParams(window.location.search).get('reference') || '');
  const [passes, setPasses] = useState(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [showMobileCta, setShowMobileCta] = useState(false);
  const [email, setEmail] = useState('');
  const [guest, setGuest] = useState('');
  const [phone, setPhone] = useState('');
  const unit = tier === 'early' ? 3000 : 5000;
  const subtotal = unit * qty;
  const fee = Math.min(2000, Math.ceil(((subtotal + 100) / (1 - 0.015)) - subtotal));
  const total = subtotal + fee;
  const time = useMemo(() => {
    const secs = Math.max(0, Math.floor((target - clock) / 1000));
    return [Math.floor(secs / 86400), Math.floor((secs % 86400) / 3600), Math.floor((secs % 3600) / 60), secs % 60];
  }, [clock]);
  useEffect(() => { const id = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { let active=true; const refresh=()=>fetch('/api/inventory').then(r=>r.json()).then(d=>{if(active&&Number.isInteger(d.remaining))setRemaining(d.remaining)}).catch(()=>{}); refresh(); const id=setInterval(refresh,30000); return()=>{active=false;clearInterval(id)}; }, []);
  useEffect(() => { const target=document.getElementById('tickets'); if(!target)return; const observer=new IntersectionObserver(([entry])=>setShowMobileCta(!entry.isIntersecting),{threshold:.12}); observer.observe(target); return()=>observer.disconnect(); }, []);
  useEffect(() => { if (remaining === 0 && tier === 'early') { setTier('regular'); setQty(1); } }, [remaining, tier]);
  const chooseTier = (which) => { setTier(which); setQty(1); setError(''); };
  const changeQty = (delta) => setQty((v) => Math.max(1, Math.min(10, tier === 'early' ? Math.min(remaining, v + delta) : v + delta)));
  async function checkout(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const res = await fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, fullName: guest, phone, quantity: qty, tier }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout could not start. Please try again.');
      if (data.authorization_url) window.location.assign(data.authorization_url);
      else throw new Error('Payment link was not returned. Please contact the organizer.');
    } catch (err) { setError(err.message || 'Unable to start checkout. Please contact the organizer.'); } finally { setBusy(false); }
  }
  async function copyAddress() { await navigator.clipboard?.writeText('Igbekon, Ado-Odo, Ota, Ogun State'); setCopied(true); setTimeout(() => setCopied(false), 1800); }
  async function lookupPasses(e) { e.preventDefault(); setError(''); setLookupBusy(true); try { const r=await fetch('/api/passes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:passEmail,reference:passReference})}); const d=await r.json(); if(!r.ok)throw new Error(d.error); setPasses(d.passes); } catch(err){setError(err.message||'Pass lookup is temporarily unavailable.')} finally{setLookupBusy(false)} }
  const socials = (className='') => <div className={`socials ${className}`}>{SOCIALS.map(({label,href,Icon}) => <a key={label} href={href} aria-label={label} title={label}><Icon size={17}/></a>)}</div>;

  return <>
    <div className="ambient ambient-a"/><div className="ambient ambient-b"/><div className="ambient ambient-c"/>
    <header className="nav-wrap"><nav className="nav shell">
      <a className="brand" href="#top" aria-label="Soakers Splash Squad home"><span className="brand-mark"><Waves size={22}/></span><span><b>SOAKERS <i>'27</i></b><small>PLANNET WORLD ENTERTAINMENT</small></span></a>
      <div className="nav-mid"><span className="remaining"><span className="pulse-dot"/><Flame size={14}/>{remaining ? `${remaining} / 200 EARLY BIRD LEFT` : 'EARLY BIRD SOLD OUT'}</span></div>
      <div className="nav-actions"><button className="nav-link" onClick={() => setPassOpen(true)}><Ticket size={15}/> My Pass</button><a className="button button-small" href="#tickets">Get Tickets <ArrowRight size={15}/></a></div>
    </nav></header>

    <main id="top">
      <section className="hero shell">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line"/> PLANNET WORLD ENTERTAINMENT PRESENTS</div>
          <div className="date-pill"><span className="date-spark"/> JAN 1, 2027 <span>•</span> 10PM TILL DAWN <span>•</span> ADO-ODO, OTA</div>
          <h1>SOAKERS<br/><span className="title-gradient">SPLASH SQUAD</span><em>2027</em></h1>
          <p className="tagline">“Same Vibes, <span>Bigger Moves!</span>”</p>
          <p className="intro">The year begins at the water’s edge. A night of poolside heat, electric sound and memories that stay with you till sunrise.</p>
          <div className="countdown" aria-label="Countdown to event">{['DAYS','HRS','MINS','SECS'].map((label,i)=><div className="time-cell" key={label}><strong>{String(time[i]).padStart(2,'0')}</strong><small>{label}</small></div>)}</div>
          <div className="hero-actions"><a href="#tickets" className="button button-primary">Grab Your Pass <ArrowRight size={17}/></a><button className="button button-ghost" onClick={() => setPassOpen(true)}>Retrieve Pass <QrCode size={16}/></button></div>
          {socials('hero-socials')}
        </div>
        <div className="hero-art" aria-label="An abstract poolside night scene for Soakers Splash Squad 2027">
          <div className="art-halo"/><div className="night-scene"><div className="scene-topline"><span>PLANNET WORLD ENTERTAINMENT</span><span>01 — 01 — 27</span></div>
            <div className="scene-sky"><span className="scene-moon"/><span className="scene-star star-one"/><span className="scene-star star-two"/><span className="scene-star star-three"/><span className="scene-palm palm-left">✳</span><span className="scene-palm palm-right">✳</span><div className="scene-headline"><small>NEW YEAR · POOL PARTY</small><b>SAME VIBES.<br/><i>BIGGER MOVES.</i></b><span><Sparkles size={13}/> FRIDAY · 10PM TILL DAWN</span></div></div>
            <div className="scene-pool"><span className="pool-shimmer shimmer-one"/><span className="pool-shimmer shimmer-two"/><span className="pool-shimmer shimmer-three"/><span className="pool-ripple ripple-one"/><span className="pool-ripple ripple-two"/><span className="pool-ripple ripple-three"/><b>SOAKERS SPLASH SQUAD <i>2027</i></b></div>
            <div className="scene-bottom"><span><MapPin size={12}/> IGBEKON · ADO-ODO · OTA</span><span className="scene-vip"><Sparkles size={12}/> THE VIP NEW YEAR EXPERIENCE</span></div>
          </div><span className="art-index">01 <i>/</i> 27</span>
          <div className="vertical-note">MAKE A SPLASH · MAKE A MEMORY</div>
        </div>
        <a className="scroll-cue" href="#tickets"><span>SCROLL TO THE GOOD PART</span><ArrowDown size={15}/></a>
      </section>

      <section className="ticket-section section-pad" id="tickets"><div className="shell">
        <div className="section-head"><div><div className="eyebrow"><span className="eyebrow-line"/> YOUR NIGHT STARTS HERE</div><h2>Choose your <span>entry.</span></h2></div><p>One night. One pool. Your people.<br/>Lock in your place before the countdown ends.</p></div>
        <div className="ticket-layout">
          <form id="checkoutForm" className="booking-form" onSubmit={checkout}>
            <div className="step-label"><span>01</span> SELECT YOUR PASS <i/></div>
            <div className="tier-list">
              <button type="button" className={`tier-card early-card ${tier==='early'?'selected':''} ${remaining===0?'sold':''}`} onClick={()=>remaining && chooseTier('early')} disabled={!remaining}>
                <span className="tier-top"><span className="tier-tag">FIRST WAVE</span>{remaining ? <span className="tier-availability"><span className="live-dot"/> LIMITED RELEASE</span> : <span className="sold-tag">SOLD OUT</span>}</span>
                <span className="tier-name">Early Bird <b>{remaining ? '01' : '—'}</b></span><span className="tier-price">₦3,000 <small>/ person</small></span>
                <span className="progress-track"><i style={{width:`${(200-remaining)/2}%`}}/></span><span className="tier-foot">{200-remaining} / 200 CLAIMED <span>{remaining} LEFT</span></span><span className="select-ring">{tier==='early'&&<Check size={14}/>}</span>
              </button>
              <button type="button" className={`tier-card regular-card ${tier==='regular'?'selected':''}`} onClick={()=>chooseTier('regular')}>
                <span className="tier-top"><span className="tier-tag">GENERAL ENTRY</span><span className="tier-availability">ON SALE</span></span>
                <span className="tier-name">Regular <b>02</b></span><span className="tier-price">₦5,000 <small>/ person</small></span><span className="regular-note">Your place at the water’s edge.</span>
                <span className="select-ring">{tier==='regular'&&<Check size={14}/>}</span>
              </button>
            </div>
            <div className="quantity-row"><div><b>How many are coming?</b><small>Bring your whole splash squad.</small></div><div className="stepper"><button type="button" onClick={()=>changeQty(-1)} aria-label="Decrease quantity"><Minus size={15}/></button><strong>{qty}</strong><button type="button" onClick={()=>changeQty(1)} aria-label="Increase quantity" disabled={qty >= (tier==='early'?Math.min(10,remaining):10)}><Plus size={15}/></button></div></div>
            <div className="step-label guest-step"><span>02</span> WHO’S ON THE LIST? <i/></div>
            <div className="input-grid"><label className="field wide">FULL NAME<input required autoComplete="name" value={guest} onChange={e=>setGuest(e.target.value)} placeholder="Name on your pass"/></label><label className="field">EMAIL ADDRESS<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><label className="field">WHATSAPP NUMBER<input required type="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+234 800 000 0000"/></label></div>
            <p className="secure-note"><span/> Secure checkout powered by Paystack. Retrieve your pass with your receipt reference.</p>
          </form>
          <aside className="receipt-wrap"><div className="receipt-card"><div className="receipt-top"><div><span className="micro">YOUR NIGHT, YOUR WAY</span><h3>Order <span>summary</span></h3></div><span className="receipt-icon"><Ticket size={17}/></span></div>
            <div className="receipt-event"><div className="mini-mark"><Waves size={18}/></div><div><b>SOAKERS SPLASH SQUAD '27</b><small>JAN 01 · 10PM TILL DAWN</small></div><span className="receipt-qty">× {qty}</span></div>
            <div className="receipt-lines"><div><span>Ticket Price <i>{tier==='early'?'Early Bird':'Regular'} × {qty}</i></span><b>{money(subtotal)}</b></div><div><span>Bank Charges</span><b>{money(fee)}</b></div></div>
            <div className="receipt-total"><span>TOTAL</span><strong>{money(total)}</strong></div>
            {error&&<div className="error-box" role="alert">{error}</div>}
            <button className="button pay-button" type="submit" form="checkoutForm" disabled={busy}>{busy?<><LoaderCircle className="spin" size={18}/> Preparing secure checkout…</>:<>Pay {money(total)} Now <ArrowRight size={18}/></>}</button>
            <div className="pay-trust"><span><Check size={13}/> Instant confirmation</span><span>🔒 SSL secured</span></div>
            <div className="receipt-perforation"/><div className="receipt-bottom"><span>PLANNET WORLD ENTERTAINMENT</span><span>NO REFUNDS · ALL VIBES</span></div>
          </div><div className="secure-stamp"><QrCode size={17}/><span>YOUR ENTRY<br/><b>IS SECURE</b></span><i/></div></aside>
        </div>
      </div></section>

      <section className="experience section-pad"><div className="shell"><div className="section-head experience-head"><div><div className="eyebrow"><span className="eyebrow-line"/> THE REASON WE’RE HERE</div><h2>Not just a party.<br/><span>A whole feeling.</span></h2></div><p>When the clock hits ten, leave the ordinary at the door.</p></div>
        <div className="bento">
          <article className="bento-card pool-card"><div className="bento-orb"><Waves size={27}/></div><span className="card-kicker">01 / WATER</span><h3>Poolside<br/><em>after dark.</em></h3><p>Cool water. Warm bodies. That first midnight splash hits different.</p><div className="pool-rings"/></article>
          <article className="bento-card sound-card"><div className="equalizer"><i/><i/><i/><i/><i/><i/><i/></div><span className="card-kicker">02 / SOUND</span><h3>10PM till<br/><em>the sun finds us.</em></h3><p>Non-stop sound. No early exits.</p><span className="sound-time">22:00 <b>—</b> DAWN</span></article>
          <article className="bento-card place-card"><span className="card-kicker">03 / THE PLACE</span><div className="map-orbit"><MapPin size={27}/><span/></div><h3>Igbekon,<br/><em>Ado-Odo, Ota.</em></h3><button className="copy-address" onClick={copyAddress}>{copied?<><Check size={14}/> Address copied</>:<>Copy address <Copy size={14}/></>}</button></article>
          <article className="bento-card entry-card"><div className="qr-decoration"><QrCode size={95} strokeWidth={1}/></div><span className="card-kicker">04 / ENTRY</span><h3>Your pass.<br/><em>Your way in.</em></h3><p>Every ticket comes with its own secure QR. Scan in, splash out.</p><span className="entry-chip"><Zap size={12}/> CRYPTOGRAPHIC QR ENTRY</span></article>
        </div>
      </div></section>

      <section className="faq-section section-pad"><div className="shell faq-layout"><div><div className="eyebrow"><span className="eyebrow-line"/> BEFORE YOU DIVE IN</div><h2>A few things<br/><span>to know.</span></h2><p className="faq-help">Still wondering? Our crew is one tap away.</p><a className="text-link" href={SOCIALS[0].href}>Ask us on WhatsApp <ArrowRight size={15}/></a></div>
        <div className="faq-list">{[
          ['How do I get my ticket after payment?', 'Use the order reference on your Paystack receipt together with the checkout email in My Pass to retrieve your signed QR ticket.'],
          ['Can I buy passes for my friends?', 'Absolutely. Choose the number of passes you need and enter the lead guest details. Each paid pass is valid for one person.'],
          ['What happens at the gate?', 'Show your QR pass at entry. Our team scans each code once to get your squad checked in and ready to splash.'],
          ['Can I get a refund?', 'All ticket sales are final. If you have a question about your order, reach out to the organizer before event night.']
        ].map(([q,a],i)=><button className={`faq-item ${faq===i?'open':''}`} key={q} onClick={()=>setFaq(faq===i?-1:i)}><span className="faq-num">0{i+1}</span><span className="faq-content"><b>{q}</b>{faq===i&&<small>{a}</small>}</span><ChevronDown size={17}/></button>)}</div>
      </div></section>
    </main>

    <footer className="footer"><div className="shell footer-main"><a className="brand" href="#top"><span className="brand-mark"><Waves size={22}/></span><span><b>SOAKERS <i>'27</i></b><small>PLANNET WORLD ENTERTAINMENT</small></span></a><p>Same Vibes.<br/><b>Bigger Moves.</b></p>{socials('footer-socials')}</div><div className="shell footer-bottom"><span>© 2027 PLANNET WORLD ENTERTAINMENT</span><span>IGBEKON, ADO-ODO, OTA · OGUN STATE</span><a href="#top">BACK TO TOP ↑</a></div></footer>

    <div className={`contact-dock ${contactOpen?'contact-open':''}`}><button className="dock-toggle" onClick={()=>setContactOpen(!contactOpen)} aria-label="Contact the organizer">{contactOpen?<X size={19}/>:<MessageCircle size={19}/>}</button><span className="dock-label">TALK TO THE CREW</span><div className="dock-items">{SOCIALS.map(({label,href,Icon})=><a key={label} href={href} aria-label={label} title={label}><Icon size={17}/></a>)}</div></div>
    {showMobileCta&&<div className="mobile-sticky"><span>FROM <b>{money(remaining?3000:5000)}</b></span><a href="#tickets">Get your pass <ArrowRight size={16}/></a></div>}

    {passOpen&&<div className="modal-backdrop" onClick={()=>{setPassOpen(false);setError('');setPasses(null)}}><div className="modal pass-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>{setPassOpen(false);setError('');setPasses(null)}} aria-label="Close"><X size={21}/></button><span className="modal-icon"><Ticket size={21}/></span><span className="micro">YOUR NIGHT IS WAITING</span><h2>Find your <span>pass.</span></h2><p>Enter the order reference from your Paystack receipt and the checkout email.</p><form onSubmit={lookupPasses}><label className="field">ORDER REFERENCE<input required value={passReference} onChange={e=>setPassReference(e.target.value.toUpperCase())} placeholder="SSS-XXXXXXXXXXXX"/></label><label className="field">EMAIL ADDRESS<input type="email" required value={passEmail} onChange={e=>setPassEmail(e.target.value)} placeholder="you@example.com"/></label><button className="button button-primary" disabled={lookupBusy}>{lookupBusy?'Searching…':<>Find my pass <ArrowRight size={16}/></>}</button>{error&&<span className="lookup-note">{error}</span>}</form>{passes&&<div className="pass-results">{passes.length?passes.map(pass=><div className="pass-result" key={pass.code}><QRCodeSVG value={pass.qr_token} size={66} bgColor="#ffffff" fgColor="#07111e" level="M"/><span><b>{pass.code}</b><small>{pass.guest_name} · {pass.tier==='early'?'Early Bird':'Regular'} entry</small></span><span className="pass-valid">VALID</span></div>):<p>No valid passes found for that reference and email.</p>}</div>}<a className="text-link" href={SOCIALS[0].href}>Need help? Message the crew</a></div></div>}
  </>;
}
createRoot(document.getElementById('root')).render(<App/>);
