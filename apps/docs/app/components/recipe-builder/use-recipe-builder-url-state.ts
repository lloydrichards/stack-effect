import { useSelector } from "@tanstack/react-form";
import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router";
import { useRecipeBuilderForm } from "./form";
import {
  decodeRecipeBuilderUrl,
  encodeRecipeBuilderUrl,
} from "./recipe-builder-url";

export function useRecipeBuilderUrlState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.toString();
  const decoded = useMemo(() => decodeRecipeBuilderUrl(searchParams), [search]);
  const initialValuesRef = useRef(decoded.initialValues);
  const form = useRecipeBuilderForm(initialValuesRef.current);
  const values = useSelector(form.store, (state) => state.values);
  const formValid = useSelector(form.store, (state) => state.isValid);
  const formDirty = useSelector(form.store, (state) => state.isDirty);
  const hasRecipeParams = search.length > 0;
  const lastSearchRef = useRef(search);
  const externalNavigationPendingRef = useRef(false);
  const decodedSearch = decoded.issue
    ? undefined
    : encodeRecipeBuilderUrl(decoded.initialValues).toString();
  const formSearch = formValid
    ? encodeRecipeBuilderUrl(values).toString()
    : undefined;

  useEffect(() => {
    if (search === lastSearchRef.current) return;
    lastSearchRef.current = search;
    if (
      decodedSearch !== undefined &&
      (formSearch === undefined || decodedSearch !== formSearch)
    ) {
      externalNavigationPendingRef.current = true;
      initialValuesRef.current = decoded.initialValues;
      form.reset(decoded.initialValues);
    }
  }, [decoded.initialValues, decodedSearch, form, formSearch, search]);

  useEffect(() => {
    if (externalNavigationPendingRef.current) {
      externalNavigationPendingRef.current = false;
      return;
    }
    if (
      decoded.issue !== undefined ||
      formSearch === undefined ||
      (!hasRecipeParams && !formDirty)
    ) {
      return;
    }
    if (searchParams.toString() !== formSearch) {
      setSearchParams(new URLSearchParams(formSearch), {
        preventScrollReset: true,
        replace: true,
      });
    }
  }, [
    decoded.issue,
    formSearch,
    formDirty,
    hasRecipeParams,
    searchParams,
    setSearchParams,
  ]);

  return {
    form,
    urlIssue: decoded.issue,
    workerEnabled: decoded.issue === undefined,
  };
}
