import { useState, useEffect } from "react";

export function useInView(ref: React.RefObject<HTMLElement | null>, root?: HTMLElement | null) {
 const [inView, setInView] = useState(false);

 useEffect(() => {
 const el = ref.current;
 if (!el) return;

 const obs = new IntersectionObserver(
 ([e]) => {
 if (e.isIntersecting) {
 setInView(true);
 obs.disconnect(); // We only care about it entering view once for lazy loading
 }
 },
 { root: root ?? null, rootMargin: "300px 0px" }
 );

 obs.observe(el);
 return () => obs.disconnect();
 }, [ref, root]);

 return inView;
}
