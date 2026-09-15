(()=>{
  const KEY="coveragefit_events_v4";
  function read(){try{return JSON.parse(localStorage.getItem(KEY)||"[]")}catch(e){return[]}}
  window.CoverageFitAnalytics={
    track(event,properties={}){
      const attribution=window.CoverageFitAttribution?.get?.()||{};
      const rows=read();
      const detail={
        event,
        properties:{...properties,attribution},
        at:new Date().toISOString(),
        path:location.pathname,
        source:attribution.source||new URLSearchParams(location.search).get("source")||"direct",
        campaign:attribution.campaign||'' ,
        sessionId:attribution.sessionId||''
      };
      rows.push(detail);
      try{localStorage.setItem(KEY,JSON.stringify(rows.slice(-1000)))}catch(e){}
      window.dataLayer=window.dataLayer||[];
      window.dataLayer.push({event,...detail.properties,cf_campaign:detail.campaign,cf_source:detail.source,cf_session_id:detail.sessionId});
      window.dispatchEvent(new CustomEvent("coveragefit:event",{detail}));
    },
    export(){return read()},
    clear(){localStorage.removeItem(KEY)}
  };
  window.CoverageFitAnalytics.track("page_view");
})();
