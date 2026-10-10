import * as React from "react";
import { Outlet, useLocation, type OutletProps } from "react-router-dom";
import { Loading } from "./Loading";
import { ErrorBoundary } from "./ErrorBoundary";

/** Shown while a page's code downloads. */
export function PageLoading() {
  return <Loading label="Loading page" />;
}

/** A layout's page slot: the layout stays on screen while the next page loads. */
export function LazyOutlet(props: OutletProps) {
  const location = useLocation();
  return (
    <ErrorBoundary resetKey={location.pathname}>
      <React.Suspense fallback={<PageLoading />}>
        <Outlet {...props} />
      </React.Suspense>
    </ErrorBoundary>
  );
}
