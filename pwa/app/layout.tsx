import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./mobile-nav-fix.css";
import "./quran.css";
import "./direction-fixes.css";
import "./parity.css";
import "./quran-index-fix.css";
import "./home-app-match.css";
import "./fluid-dashboard.css";
import "./islamic-rich.css";
import "./home-header-center.css";
import "./website-desktop-final.css";
import EmailManageRedirect from "./EmailManageRedirect";
import NavEnhancer from "./NavEnhancer";
import WebMasjidTvMenuEnhancer from "./WebMasjidTvMenuEnhancer";
import LocationPrayerTimesEnhancer from "./LocationPrayerTimesEnhancer";
import LocationMovementRefresh from "./LocationMovementRefresh";
import PrayerAlertAudioEnhancer from "./PrayerAlertAudioEnhancer";
import PrayerCardInteractionEnhancer from "./PrayerCardInteractionEnhancer";
import ServiceWorkerRegistration from "./ServiceWorkerRegistration";
import WebPushRegistration from "./WebPushRegistration";
import QuranUiFixEnhancer from "./QuranUiFixEnhancer";
import QuranReferenceLayoutEnhancer from "./QuranReferenceLayoutEnhancer";
import QuranReferenceControlsEnhancer from "./QuranReferenceControlsEnhancer";
import QuranViewModeEnhancer from "./QuranViewModeEnhancer";
import QuranTranslationLanguageEnhancer from "./QuranTranslationLanguageEnhancer";
import QuranVerseMenuEnhancer from "./QuranVerseMenuEnhancer";
import QuranInfoMeaningEnhancer from "./QuranInfoMeaningEnhancer";
import QuranHeaderSearchEnhancer from "./QuranHeaderSearchEnhancer";
import QuranHomeLinkFixEnhancer from "./QuranHomeLinkFixEnhancer";
import QuranCleanReadingEnhancer from "./QuranCleanReadingEnhancer";
import QuranCleanToolbarFixEnhancer from "./QuranCleanToolbarFixEnhancer";
import QuranMoreMenuEnhancer from "./QuranMoreMenuEnhancer";
import QuranTapAnchorEnhancer from "./QuranTapAnchorEnhancer";
import QuranPrintedPageEnhancer from "./QuranPrintedPageEnhancer";
import QuranScriptTajweedEnhancer from "./QuranScriptTajweedEnhancer";
import QuranPrintedScrollEnhancer from "./QuranPrintedScrollEnhancer";
import QuranDesktopScrollInputFix from "./QuranDesktopScrollInputFix";
import QuranIndexEnhancer from "./QuranIndexEnhancer";
import QuranAudioSystem from "./QuranAudioSystem";
import QuranGlyphSafetyEnhancer from "./QuranGlyphSafetyEnhancer";
import QuranContextSurahChooserEnhancer from "./QuranContextSurahChooserEnhancer";
import QuranPageOrderGuardEnhancer from "./QuranPageOrderGuardEnhancer";
import QuranSchoolLinkEnhancer from "./QuranSchoolLinkEnhancer";
import WebsiteLogoEnhancer from "./WebsiteLogoEnhancer";
import WebIslamicVisualEnhancer from "./WebIslamicVisualEnhancer";
import WebAppNav from "./WebAppNav";
import RemoteAppControl from "./RemoteAppControl";
import CompactEmailAdhanSignup from "./CompactEmailAdhanSignup";

const geistSans=Geist({variable:"--font-geist-sans",subsets:["latin"]});
const geistMono=Geist_Mono({variable:"--font-geist-mono",subsets:["latin"]});
const basePath=process.env.NEXT_PUBLIC_BASE_PATH||"";const asset=(path:string)=>`${basePath}${path}`;const ICON_VERSION="20260825-exact-5";
export const metadata:Metadata={title:"Hassoun",description:"Prayer times, Qur’an reading and audio, Qur’an School, memorization, Qibla, Islamic events and learning tools.",manifest:asset(`/manifest.webmanifest?v=${ICON_VERSION}`),appleWebApp:{capable:true,statusBarStyle:"black-translucent",title:"Hassoun"},other:{"codex-preview":"development"},icons:{icon:[{url:asset(`/hassoun-brand.svg?v=${ICON_VERSION}`),type:"image/svg+xml",sizes:"any"}],shortcut:asset(`/hassoun-brand.svg?v=${ICON_VERSION}`),apple:[{url:asset(`/hassoun-brand.svg?v=${ICON_VERSION}`),type:"image/svg+xml",sizes:"any"}]}};
export const viewport:Viewport={width:"device-width",initialScale:1,viewportFit:"cover",themeColor:"#0b5b47"};

// TV and tablet displays must only open through their explicit routes.
// Never redirect the website based on device characteristics or persisted TV preferences.
const tvBootstrap = `(function(){
  var p=window.location.pathname||'/';
  var isTv=p.indexOf('/masjid-tv')!==-1||p.indexOf('/masjid-tv-legacy.html')!==-1;
  function fmt(){var d=new Date(),h=d.getHours(),m=d.getMinutes(),s=d.getSeconds(),ap=h>=12?'p.m.':'a.m.';h=h%12||12;return h+':'+(m<10?'0':'')+m+':'+(s<10?'0':'')+s+' '+ap;}
  function updateLocalClock(){
    if(isTv)return;
    try{
      var all=document.getElementsByTagName('*'),i,j,label,parent,kids,t;
      for(i=0;i<all.length;i++){
        label=(all[i].textContent||'').replace(/\\s+/g,' ').replace(/^\\s+|\\s+$/g,'').toLowerCase();
        if(label==='local time'||label==='الوقت المحلي'){
          parent=all[i].parentNode;if(!parent||!parent.getElementsByTagName)continue;
          kids=parent.getElementsByTagName('*');
          for(j=0;j<kids.length;j++){
            t=(kids[j].textContent||'').replace(/\\s+/g,' ').replace(/^\\s+|\\s+$/g,'');
            if(/^\\d{1,2}:\\d{2}(:\\d{2})?\\s*(a\\.?m\\.?|p\\.?m\\.?)$/i.test(t)){kids[j].textContent=fmt();return;}
          }
        }
      }
    }catch(e){}
  }
  var clockTimer=0;function clockBeat(){updateLocalClock();clockTimer=setTimeout(clockBeat,700);}
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',clockBeat);}else{clockBeat();}
  if(window.addEventListener){window.addEventListener('focus',updateLocalClock,false);window.addEventListener('pageshow',updateLocalClock,false);}
})();`;

export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><head><script dangerouslySetInnerHTML={{__html:tvBootstrap}}/></head><body className={`${geistSans.variable} ${geistMono.variable}`}><RemoteAppControl/>{children}<EmailManageRedirect/><NavEnhancer/><WebMasjidTvMenuEnhancer/><LocationPrayerTimesEnhancer/><LocationMovementRefresh/><PrayerAlertAudioEnhancer/><PrayerCardInteractionEnhancer/><ServiceWorkerRegistration/><WebPushRegistration/><QuranUiFixEnhancer/><QuranReferenceLayoutEnhancer/><QuranReferenceControlsEnhancer/><QuranViewModeEnhancer/><QuranTranslationLanguageEnhancer/><QuranVerseMenuEnhancer/><QuranInfoMeaningEnhancer/><QuranHeaderSearchEnhancer/><QuranHomeLinkFixEnhancer/><QuranCleanReadingEnhancer/><QuranCleanToolbarFixEnhancer/><QuranMoreMenuEnhancer/><QuranTapAnchorEnhancer/><QuranPrintedPageEnhancer/><QuranScriptTajweedEnhancer/><QuranPrintedScrollEnhancer/><QuranDesktopScrollInputFix/><QuranIndexEnhancer/><QuranAudioSystem/><QuranGlyphSafetyEnhancer/><QuranContextSurahChooserEnhancer/><QuranPageOrderGuardEnhancer/><QuranSchoolLinkEnhancer/><WebsiteLogoEnhancer/><WebIslamicVisualEnhancer/><CompactEmailAdhanSignup/><WebAppNav/></body></html>}
