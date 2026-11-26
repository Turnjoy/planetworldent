import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ExternalLink, LoaderCircle, MapPin, Plus, ShieldCheck, Ticket, Waves, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import './index.css';
import './passes.css';
import './refinements.css';
import './mobile-first.css';
import './platform.css';

const money = n => `₦${Number(n || 0).toLocaleString('en-NG')}`;
const socials = [
  ['TikTok', import.meta.env.VITE_ORGANIZER_TIKTOK_URL || 'https://www.tiktok.com/@ibukun_oluwa70'],
  ['Instagram', import.meta.env.VITE_ORGANIZER_INSTAGRAM_URL || 'https://www.instagram.com/ibukun_oluwa70/']
];
const eventHref = slug => `/events/${encodeURIComponent(slug)}`;

function Shell({ children }) {
  return <><header className="platform-nav"><a className="platform-brand" href="/"><span className="brand-mark"><Waves size={20}/></span><span><b>PLANNET WORLD</b><small>ENTERTAINMENT</small></span></a><nav><a href="/#events">Events</a><a href="/admin">Admin</a></nav></header>{children}<footer className="platform-footer"><span>© PLANNET WORLD ENTERTAINMENT</span><div>{socials.map(([label,url])=><a key={label} href={url} target="_blank" rel="noreferrer">{label} <ExternalLink size={13}/></a>)}</div></footer></>;
}

function PhaseBadge({ event }) {
  const s = event.stats || {};
  return s.active_phase === 'Early Bird' && s.early_bird_remaining > 0
    ? <span className="phase-badge">Early Bird — {money(event.early_bird_price)} <small>({s.early_bird_remaining} of {event.early_bird_limit} left)</small></span>
    : <span className="phase-badge regular">Regular — {money(event.regular_price)}</span>;
}

function EventCard({ event }) {
  return <article className="event-card">
    <a className="event-art" href={eventHref(event.slug)} style={event.banner_url ? { backgroundImage: `linear-gradient(180deg,transparent,#06101d),url("${event.banner_url}")` } : undefined}>
      <span className="event-art-mark"><Waves size={24}/></span><span className="event-art-date"><CalendarDays size={14}/> {event.event_date}</span>
    </a>
    <div className="event-card-content"><span className="event-eyebrow">PLANNET WORLD PRESENTS</span><h3>{event.title}</h3>{event.tagline && <p className="event-tagline">{event.tagline}</p>}<div className="event-meta"><span><MapPin size={15}/>{event.venue}</span></div><PhaseBadge event={event}/><a className="platform-button" href={eventHref(event.slug)}>Get Ticket <ArrowRight size={16}/></a></div>
  </article>;
}

function HomePage() {
  const [events, setEvents] = useState([]); const [error, setError] = useState('');
  useEffect(() => { let live = true; const load = () => fetch('/api/events').then(r => r.json()).then(d => { if (!live) return; if (!d.events) throw new Error(d.error || 'Events could not load.'); setEvents(d.events); setError(''); }).catch(e => live && setError(e.message)); load(); const timer = setInterval(load, 30000); return () => { live = false; clearInterval(timer); }; }, []);
  return <Shell><main className="platform-main">
    <section className="platform-hero"><div className="platform-hero-orb"/><span className="event-eyebrow">LIVE ENTERTAINMENT · UNFORGETTABLE NIGHTS</span><h1>Your next<br/><em>great night.</em></h1><p>Find your people, pick your event, and book your place with Plannet World Entertainment.</p><a className="platform-button" href="#events">Explore events <ArrowRight size={16}/></a></section>
    <section className="platform-events" id="events"><div className="platform-section-head"><div><span className="event-eyebrow">WHAT’S ON</span><h2>Upcoming events</h2></div><span className="live-label"><i/> Live ticket availability</span></div>
      {error && <div className="platform-error">{error}</div>}{!events.length && !error && <div className="platform-loading"><LoaderCircle className="spin"/> Loading events…</div>}
      <div className="events-grid">{events.map(event => <EventCard event={event} key={event.id}/>)}</div>
    </section>
  </main></Shell>;
}

function EventPage({ slug }) {
  const [event,setEvent]=useState(null); const [qty,setQty]=useState(1); const [fullName,setFullName]=useState(''); const [email,setEmail]=useState(''); const [phone,setPhone]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [passesOpen,setPassesOpen]=useState(false); const [passEmail,setPassEmail]=useState(''); const [reference,setReference]=useState(new URLSearchParams(location.search).get('reference')||''); const [passes,setPasses]=useState([]); const [passBusy,setPassBusy]=useState(false);
  useEffect(()=>{let live=true; const load=()=>fetch(`/api/events/${encodeURIComponent(slug)}`).then(r=>r.json()).then(d=>{if(!live)return;if(!d.event)throw new Error(d.error||'Event not found.');setEvent(d.event);setError('');}).catch(e=>live&&setError(e.message));load();const timer=setInterval(load,20000);return()=>{live=false;clearInterval(timer);};},[slug]);
  const phase=event?.stats?.active_phase||'Early Bird'; const unit=event?(phase==='Early Bird'?event.early_bird_price:event.regular_price):0; const subtotal=unit*qty; const fee=Math.min(2000,Math.ceil(((subtotal+100)/(1-.015))-subtotal));
  async function checkout(e){e.preventDefault();setBusy(true);setError('');try{const r=await fetch('/api/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event_id:event.id,fullName,email,phone,quantity:qty})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Checkout could not start.');location.assign(d.authorization_url);}catch(err){setError(err.message);fetch(`/api/events/${encodeURIComponent(slug)}`).then(r=>r.json()).then(d=>d.event&&setEvent(d.event)).catch(()=>{});}finally{setBusy(false);}}
  async function lookupPasses(e){e.preventDefault();setPassBusy(true);setError('');try{const r=await fetch('/api/passes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:passEmail,reference})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Pass lookup failed.');setPasses(d.passes||[]);}catch(err){setError(err.message);}finally{setPassBusy(false);}}
  return <Shell><main className="platform-main event-page"><a className="back-link" href="/#events"><ArrowLeft size={15}/> All events</a>
    {event ? <><section className="event-detail-hero" style={event.banner_url?{backgroundImage:`linear-gradient(90deg,rgba(3,10,20,.97),rgba(3,10,20,.65)),url("${event.banner_url}")`}:undefined}><span className="event-eyebrow">PLANNET WORLD ENTERTAINMENT PRESENTS</span><h1>{event.title}</h1>{event.tagline&&<p className="event-tagline">{event.tagline}</p>}<p>{event.description}</p><div className="event-detail-meta"><span><CalendarDays size={16}/>{event.event_date}</span><span><MapPin size={16}/>{event.venue}</span></div><PhaseBadge event={event}/></section>
    <section className="checkout-panel"><div><span className="event-eyebrow">SECURE CHECKOUT</span><h2>Save your spot.</h2><p>Ticket pricing updates automatically as the Early Bird allocation sells out.</p><button className="text-button" onClick={()=>setPassesOpen(true)}>Already paid? Retrieve your pass</button></div><form onSubmit={checkout} className="platform-form">
      <label>Full name<input required autoComplete="name" value={fullName} onChange={e=>setFullName(e.target.value)} maxLength="120"/></label><label>Email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} maxLength="254"/></label><label>WhatsApp number<input required type="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} maxLength="32"/></label>
      <label>Tickets<select value={qty} onChange={e=>setQty(Number(e.target.value))}>{Array.from({length:10},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label>
      <div className="checkout-summary"><span>{phase} × {qty}</span><b>{money(subtotal)}</b><span>Bank charges</span><b>{money(fee)}</b><strong>Total</strong><strong>{money(subtotal+fee)}</strong></div>
      {error&&<div className="platform-error" role="alert">{error}</div>}<button className="platform-button full" disabled={busy}>{busy?<><LoaderCircle className="spin"/> Connecting to Paystack…</>:<>Pay {money(subtotal+fee)} <ArrowRight size={16}/></>}</button><small className="checkout-safe"><ShieldCheck size={14}/> Payment secured by Paystack</small>
    </form></section></>:<div className="platform-loading">{error||'Loading event…'}</div>}
    {passesOpen&&<div className="platform-modal-backdrop" onClick={()=>{setPassesOpen(false);setPasses([])}}><section className="platform-modal" onClick={e=>e.stopPropagation()}><button className="platform-modal-close" onClick={()=>{setPassesOpen(false);setPasses([])}} aria-label="Close"><X/></button><span className="event-eyebrow">TICKET LOOKUP</span><h2>Retrieve your pass</h2><form className="platform-form" onSubmit={lookupPasses}><label>Receipt email<input required type="email" value={passEmail} onChange={e=>setPassEmail(e.target.value)}/></label><label>Paystack reference<input required value={reference} onChange={e=>setReference(e.target.value)}/></label><button className="platform-button full" disabled={passBusy}>{passBusy?'Looking up…':'Find my pass'}</button></form>{passes.length>0&&<div className="pass-results">{passes.map(pass=><div key={pass.code}><b>{pass.guest_name}</b><small>{pass.code} · {pass.ticket_phase||pass.tier}</small><QRCodeSVG value={pass.qr_token} size={150}/></div>)}</div>}{error&&<div className="platform-error">{error}</div>}</section></div>}
  </main></Shell>;
}

const blankEvent={title:'',slug:'',tagline:'',description:'',event_date:'',venue:'',banner_url:'',early_bird_price:3000,early_bird_limit:200,regular_price:'',gate_pin:'',is_active:true};
function AdminPage(){
  const [pin,setPin]=useState(()=>sessionStorage.getItem('plannet-admin-pin')||''); const [authenticated,setAuthenticated]=useState(false); const [events,setEvents]=useState([]); const [form,setForm]=useState(blankEvent); const [editing,setEditing]=useState(''); const [loading,setLoading]=useState(false); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
  async function load(){setLoading(true);setError('');try{const r=await fetch('/api/admin/events',{headers:{'x-admin-pin':pin}});const d=await r.json();if(!r.ok)throw new Error(d.error||'Admin access denied.');setEvents(d.events||[]);setAuthenticated(true);sessionStorage.setItem('plannet-admin-pin',pin);}catch(e){setAuthenticated(false);sessionStorage.removeItem('plannet-admin-pin');setError(e.message);}finally{setLoading(false);}}
  useEffect(()=>{if(pin)load();},[]);
  useEffect(()=>{if(!authenticated)return;const timer=setInterval(()=>load(),20000);return()=>clearInterval(timer);},[authenticated]);
  function beginEdit(event){setEditing(event.id);setForm({...event,regular_price:event.regular_price,tagline:event.tagline||'',description:event.description||'',banner_url:event.banner_url||''});window.scrollTo({top:0,behavior:'smooth'});}
  function resetForm(){setEditing('');setForm(blankEvent);setError('');setNotice('');}
  async function save(e){e.preventDefault();setLoading(true);setError('');setNotice('');try{const r=await fetch(editing?`/api/admin/events/${editing}`:'/api/admin/events',{method:editing?'PUT':'POST',headers:{'content-type':'application/json','x-admin-pin':pin},body:JSON.stringify({...form,slug:form.slug||form.title})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not save event.');const message=editing?'Event updated.':'Event created.';resetForm();await load();setNotice(message);}catch(err){setError(err.message);}finally{setLoading(false);}}
  async function toggle(event){setLoading(true);setError('');try{const r=await fetch(`/api/admin/events/${event.id}`,{method:'PUT',headers:{'content-type':'application/json','x-admin-pin':pin},body:JSON.stringify({is_active:!event.is_active})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not update event.');await load();}catch(e){setError(e.message);}finally{setLoading(false);}}
  const set=(key,value)=>setForm(f=>({...f,[key]:value}));
  return <Shell><main className="platform-main admin-page"><a className="back-link" href="/"><ArrowLeft size={15}/> Public events</a><section className="admin-heading"><div><span className="event-eyebrow">PLANNET WORLD · MANAGEMENT</span><h1>Event dashboard</h1><p>Create events, manage ticket sales, and keep pricing current.</p></div><ShieldCheck size={36}/></section>
    {!authenticated?<form className="admin-login" onSubmit={e=>{e.preventDefault();load();}}><h2>Admin sign in</h2><p>Enter the admin PIN configured in Cloudflare Pages.</p><label>Admin PIN<input type="password" required value={pin} onChange={e=>setPin(e.target.value)} autoComplete="current-password"/></label>{error&&<div className="platform-error">{error}</div>}<button className="platform-button full" disabled={loading}>{loading?'Verifying…':'Open dashboard'}</button></form>:<>
      <div className="admin-toolbar"><div><b>{events.length} events</b><small>Sales stats refresh automatically every 20 seconds.</small></div><button className="button button-ghost" onClick={load} disabled={loading}>Refresh stats</button><button className="platform-button" onClick={resetForm}><Plus size={16}/> New event</button><button className="text-button" onClick={()=>{sessionStorage.removeItem('plannet-admin-pin');setAuthenticated(false);setPin('');}}>Sign out</button></div>
      {notice&&<div className="platform-success"><Check size={16}/>{notice}</div>}{error&&<div className="platform-error">{error}</div>}
      <div className="admin-grid">{events.map(event=><article className="admin-event" key={event.id}><div className="admin-event-top"><div><span className={`admin-status ${event.is_active?'active':''}`}>{event.is_active?'ACTIVE':'INACTIVE'}</span><h2>{event.title}</h2><p>{event.event_date} · {event.venue}</p></div><PhaseBadge event={event}/></div><div className="admin-stats"><div><b>{Math.min(event.stats.paid_count,event.early_bird_limit)} / {event.early_bird_limit}</b><small>Early Bird sold</small></div><div><b>{Math.max(0,event.stats.paid_count-event.early_bird_limit)}</b><small>Regular sold</small></div><div><b>{event.stats.paid_count}</b><small>Total paid</small></div></div><div className="admin-event-actions"><button className="button button-ghost" onClick={()=>beginEdit(event)}>Edit event</button><button className="button button-ghost" onClick={()=>toggle(event)}>{event.is_active?'Deactivate':'Activate'}</button><a className="button button-ghost" href={eventHref(event.slug)} target="_blank" rel="noreferrer">View page <ExternalLink size={14}/></a></div></article>)}</div>
      <section className="admin-editor"><div className="platform-section-head"><div><span className="event-eyebrow">EVENT DETAILS</span><h2>{editing?'Edit event':'Create an event'}</h2></div>{editing&&<button className="text-button" onClick={resetForm}>Cancel edit</button>}</div><form className="admin-form" onSubmit={save}>
        <label>Title<input required value={form.title} onChange={e=>set('title',e.target.value)} onBlur={()=>!form.slug&&set('slug',e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''))}/></label><label>Slug<input required value={form.slug} onChange={e=>set('slug',e.target.value.toLowerCase().trim().replace(/[^a-z0-9-]+/g,'-'))}/><small>Generated from the title. Used in the public event URL.</small></label><label>Date<input required value={form.event_date} onChange={e=>set('event_date',e.target.value)} placeholder="Saturday, 15 August 2027 · 8 PM"/></label><label>Venue<input required value={form.venue} onChange={e=>set('venue',e.target.value)}/></label><label>Tagline<input value={form.tagline} onChange={e=>set('tagline',e.target.value)}/></label><label>Banner image URL (optional)<input type="url" value={form.banner_url} onChange={e=>set('banner_url',e.target.value)} placeholder="https://…"/><small>External HTTPS image only. Images are not uploaded to Supabase.</small></label><label className="admin-wide">Description<textarea rows="4" value={form.description} onChange={e=>set('description',e.target.value)}/></label><label>Early Bird Price (₦)<input type="number" min="0" step="1" value={form.early_bird_price} onChange={e=>set('early_bird_price',e.target.value)}/></label><label>Early Bird Limit<input type="number" min="0" step="1" value={form.early_bird_limit} onChange={e=>set('early_bird_limit',e.target.value)}/></label><label>Regular Price (₦)<input required type="number" min="1" step="1" value={form.regular_price} onChange={e=>set('regular_price',e.target.value)}/></label><label>Event Gate PIN<input required type="password" value={form.gate_pin} onChange={e=>set('gate_pin',e.target.value)}/></label><label className="admin-toggle"><input type="checkbox" checked={form.is_active} onChange={e=>set('is_active',e.target.checked)}/> Active event (visible on the public site)</label><div className="admin-wide admin-submit">{error&&<div className="platform-error">{error}</div>}<button className="platform-button" disabled={loading}>{loading?<LoaderCircle className="spin"/>:<Check size={16}/>} {editing?'Save changes':'Create event'}</button></div>
      </form></section>
    </>}
  </main></Shell>;
}

function PaymentCompletePage(){
  const reference=new URLSearchParams(location.search).get('reference')||'';const [state,setState]=useState('checking');const [message,setMessage]=useState('Confirming your payment and preparing your tickets…');
  useEffect(()=>{let live=true;if(!reference){setState('failed');setMessage('The payment reference is missing.');return;}fetch(`/api/verify-payment?reference=${encodeURIComponent(reference)}`).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Payment could not be confirmed yet.');if(live){setState('success');setMessage(d.email_pending?'Payment confirmed. Your tickets are ready, but the confirmation email is pending. Use the event page to retrieve your QR pass.':'Payment confirmed. Your ticket details have been sent to your checkout email. You can also retrieve your QR pass below.');}}).catch(e=>{if(live){setState('failed');setMessage(e.message);}});return()=>{live=false;};},[reference]);
  return <Shell><main className="platform-main admin-page"><section className="admin-login"><span className="event-eyebrow">PAYSTACK CHECKOUT</span><h1>{state==='checking'?'Checking payment…':state==='success'?'You’re confirmed':'Payment not confirmed yet'}</h1><p>{message}</p>{reference&&<p>Reference: <strong>{reference}</strong></p>}{state==='checking'&&<LoaderCircle className="spin"/>}<a className="platform-button" href="/#events">Back to events <ArrowRight size={16}/></a></section></main></Shell>;
}

function App(){const path=decodeURIComponent(location.pathname);const event=path.match(/^\/events\/([^/]+)\/?$/);return path==='/admin'||path==='/admin/'?<AdminPage/>:path==='/payment/complete'||path==='/payment/complete/'?<PaymentCompletePage/>:event?<EventPage slug={event[1]}/>:<HomePage/>;}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
