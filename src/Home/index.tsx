import React, {
  useRef,
  useEffect,
  useCallback,
  useReducer,
  useMemo,
  useContext,
} from 'react';
import styled from 'styled-components';
import { useHotkeys } from 'react-hotkeys-hook';
import { Resizable } from 're-resizable';

import { IPCMessage } from 'mainCommunication/ipc';
import { AuthContext, AuthState, refreshAuth } from 'Auth';
import electron, {
  isDev,
  hideMainWindow,
  connectGitHub, openLink, createTmpFile,
  trackModalOpened,
  trackSearch,
  trackShortcut,
  saveSearchQuery,
  getSavedSearchQuery,
  saveSearchFilter,
  getSavedSearchFilter,
  saveDocSearchResultsDefaultWidth,
  getDocSearchResultsDefaultWidth,
  getActiveDocSource,
  saveActiveDocSource,
  trackSignInModalOpened,
  trackSignInModalClosed,
  trackShowSearchHistory,
  trackHideSearchHistory,
  trackSelectHistoryQuery,
} from 'mainCommunication';
import useDebounce from 'hooks/useDebounce';
import {
  search as searchStackOverflow,
  StackOverflowResult,
} from 'search/stackOverflow';
import {
  searchCode as searchGitHubCode,
  CodeResult,
  init as initGitHub,
  disconnect as disconnectGitHub,
  FilePreview,
} from 'search/gitHub';
import {
  search as searchDocumentations,
  fetchDocSources,
  DocResult,
  DocSource,
} from 'search/docs';
import useIPCRenderer from 'hooks/useIPCRenderer';
import Button from 'components/Button';
import Loader from 'components/Loader';
import SignInModal from 'Auth/SignInModal';
import jsLogo from 'img/js-logo.png';

import SearchHeaderPanel, { ResultsFilter } from './SearchHeaderPanel';
import {
  StackOverflowSearchHotkeysPanel,
  GitHubCodeSearchHotkeysPanel,
  DocsSearchHotkeysPanel,
} from './HotkeysPanel';
import FocusState from './SearchItemFocusState';
import StackOverflowModal from './StackOverflow/StackOverflowModal';
import StackOverflowItem from './StackOverflow/StackOverflowItem';
import CodeItem from './GitHub/CodeItem';
import CodeModal from './GitHub/CodeModal';
import {
  DocSearchResultItem,
  DocPage,
  DocsFilterModal,
} from './Docs';
import SearchHistory from './SearchHistory';
import historyStore from './SearchHistory/historyStore';
import Hotkey, { Key } from './HotkeysPanel/Hotkey';

const Container = styled.div`
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const SearchResultsWrapper = styled.div`
  padding: 10px 15px;
  width: 100%;

  overflow: hidden;
  overflow-y: overlay;
`;

const InfoMessage = styled.div`
  margin: 100px auto 0;

  color: #5A5A6F;
  font-size: 16px;
  font-weight: 600;
`;

const GitHubConnect = styled.div`
  margin: 100px auto 0;
  display: flex;
  align-items: center;
  flex-direction: column;
`;

const ConnectGitHubButton = styled(Button)`
  margin-top: 30px;
  padding: 10px 20px;

  font-size: 15px;
  font-weight: 500;

  border-radius: 5px;
`;

const GitHubConnectTitle = styled(InfoMessage)`
  margin: 0;
`;

const GitHubError = styled.div`
  margin: 16px 0;
  color: #F44444;
`;

const SignInButton = styled(Button)`
  margin-top: 30px;
  padding: 10px 20px;

  font-size: 15px;
  font-weight: 500;

  border-radius: 5px;
`;

const SignInAgainButton = styled(Button)`
  margin-top: 30px;
  padding: 10px 20px;

  color: #535BD7;
  font-size: 15px;
  font-weight: 500;

  border-radius: 5px;
  background: transparent;
  border: 1px solid #535BD7;

  :hover {
    background: transparent;
    color: #646CEA;
    border: 1px solid #646CEA;
    cursor: pointer;
  }
`;

const EnableDocSourcesButton = styled(Button)`
  margin: 15px 0;
  padding: 10px 20px;

  font-size: 15px;
  font-weight: 500;

  border-radius: 5px;
`;


const DocsWrapper = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: flex-start;
  overflow: hidden;
`;

const DocsResultsWrapper = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`;

const ActiveDocset = styled.div`
  padding: 6px 10px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;

  font-size: 12px;

  background: #25252E;
  border-bottom: 1px solid #3B3A4A;
  border-right: 2px solid #3B3A4A;
`;

const DocsetNameLogo = styled.div`
  display: flex;
  align-items: center;
`;

const DocsetLogo = styled.img`
  margin-right: 8px;
  height: 16px;
  width: 16px;
`;

const ActiveDocsetName = styled.div`
  position: relative;
  top: 1px;
  margin-right: 8px;
  font-size: 12px;
  color: #fff;
  font-weight: 400;
`;


const DocSearchResults = styled.div`
  width: 100%;
  height: 100%;

  padding: 10px 0 20px;
  margin: 0;

  display: flex;
  flex-direction: column;

  overflow: hidden;
  overflow-y: overlay;

  border-right: 2px solid #3B3A4A;
  background: #262736;
`;

const DocsLoader = styled(Loader)`
  margin-top: 50px;
`;

const HotkeyWrapper = styled.div`
  padding: 5px;
  display: flex;
  align-items: center;

  border-radius: 5px;
  user-select: none;
  :hover {
    transition: background 170ms ease-in;
    cursor: pointer;
    background: #434252;
    > div {
      color: #fff;
    }
  }
`;

const HotkeyText = styled.div`
  margin-left: 8px;
  font-size: 12px;
  color: #78788c;
  transition: color 170ms ease-in;
`;


type SearchResultItem = StackOverflowResult | CodeResult | DocResult;
type SearchResultItems = StackOverflowResult[] | CodeResult[] | DocResult[];
type SearchResults = {
  [key in ResultsFilter]: {
    items: SearchResultItems;
    isLoading: boolean;
    scrollTopPosition: number;
    focusedIdx: {
      idx: number;
      focusState: FocusState;
    };
  }
}

enum ReducerActionType {
  SetSearchQuery,
  SetSearchFilter,

  CacheScrollTopPosition,
  ClearResults,

  StartSearching,
  SearchingSuccess,
  SearchingFail,

  FocusResultItem,

  // StackOverflow + GitHubCode modal.
  OpenModal,
  CloseModal,

  StartConnectingGitHub,
  ConnectingGitHubSuccess,
  ConnectingGitHubFail,
  DisconnectGitHubAccount,
  SetGitHubError,

  SetDocSearchResultsDefaultWidth,
  CacheDocSearchResultsWidth,

  SearchInDocPage,
  CancelSearchInDocPage,

  OpenDocsFilterModal,
  CloseDocsFilterModal,

  OpenSignInModal,
  CloseSignInModal,

  FetchDocSourcesSuccess,
  FetchDocSourcesFail,
  SetActiveDocSource,

  SetIsLoadingCachedData,

  SetHistory,
  ToggleSearchHistoryPreview,
  SetHistoryIndex,

  ToggleSearchInputFocus,
}

interface SetSearchQuery {
  type: ReducerActionType.SetSearchQuery;
  payload: {
    query: string;
  };
}

interface SetSearchFilter {
  type: ReducerActionType.SetSearchFilter;
  payload: {
    filter: ResultsFilter;
  };
}

interface CacheScrollTopPosition {
  type: ReducerActionType.CacheScrollTopPosition;
  payload: {
    filter: ResultsFilter;
    scrollTopPosition: number;
  };
}

interface ClearResults {
  type: ReducerActionType.ClearResults;
}

interface StartSearching {
  type: ReducerActionType.StartSearching;
  payload: {
    filter: ResultsFilter;
  };
}

interface SearchingSuccess {
  type: ReducerActionType.SearchingSuccess;
  payload: {
    filter: ResultsFilter;
    items: SearchResultItems;
  };
}

interface SearchingFail {
  type: ReducerActionType.SearchingFail;
  payload: {
    filter: ResultsFilter;
    errorMessage: string;
  };
}

interface FocusResultItem {
  type: ReducerActionType.FocusResultItem;
  payload: {
    filter: ResultsFilter;
    idx: number;
    focusState: FocusState;
  };
}

interface OpenModal {
  type: ReducerActionType.OpenModal;
  payload: {
    item: SearchResultItem;
  };
}

interface CloseModal {
  type: ReducerActionType.CloseModal;
}

interface StartConnectingGitHub {
  type: ReducerActionType.StartConnectingGitHub;
}

interface ConnectingGitHubSuccess {
  type: ReducerActionType.ConnectingGitHubSuccess;
}

interface ConnectingGitHubFail {
  type: ReducerActionType.ConnectingGitHubFail;
  payload: {
    errorMessage: string;
  };
}

interface SetGitHubError {
  type: ReducerActionType.SetGitHubError;
  payload: { message: string };
}

interface DisconnectGitHubAccount {
  type: ReducerActionType.DisconnectGitHubAccount;
}

interface SetDocSearchResultsDefaultWidth {
  type: ReducerActionType.SetDocSearchResultsDefaultWidth;
  payload: {
    width: number;
  };
}

interface CacheDocSearchResultsWidth {
  type: ReducerActionType.CacheDocSearchResultsWidth;
  payload: {
    width: number;
  };
}

interface SearchInDocPage {
  type: ReducerActionType.SearchInDocPage;
}

interface CancelSearchInDocPage {
  type: ReducerActionType.CancelSearchInDocPage;
}

interface OpenDocsFilterModal {
  type: ReducerActionType.OpenDocsFilterModal;
}

interface CloseDocsFilterModal {
  type: ReducerActionType.CloseDocsFilterModal;
}

interface OpenSignInModal {
  type: ReducerActionType.OpenSignInModal;
}

interface CloseSignInModal {
  type: ReducerActionType.CloseSignInModal;
}

interface FetchDocSourcesSuccess {
  type: ReducerActionType.FetchDocSourcesSuccess;
  payload: {
    docSources: DocSource[];
    activeDocSource: DocSource;
  };
}

interface FetchDocSourcesFail {
  type: ReducerActionType.FetchDocSourcesFail;
  payload: { errorMessage: string };
}

interface SetActiveDocSource {
  type: ReducerActionType.SetActiveDocSource;
  payload: { activeDocSource: DocSource };
}

interface SetIsLoadingCachedData {
  type: ReducerActionType.SetIsLoadingCachedData;
  payload: { isLoadingCachedData: boolean };
}

interface ToggleSearchHistoryPreview {
  type: ReducerActionType.ToggleSearchHistoryPreview;
  payload: { isVisible: boolean };
}

interface SetHistory {
  type: ReducerActionType.SetHistory;
  payload: { history: string[] };
}

interface SetHistoryIndex {
  type: ReducerActionType.SetHistoryIndex;
  payload: { index: number };
}

interface ToggleSearchInputFocus {
  type: ReducerActionType.ToggleSearchInputFocus;
  payload: { isFocused: boolean };
}

type ReducerAction = SetSearchQuery
  | SetSearchFilter
  | CacheScrollTopPosition
  | ClearResults
  | StartSearching
  | SearchingSuccess
  | SearchingFail
  | FocusResultItem
  | OpenModal
  | CloseModal
  | StartConnectingGitHub
  | ConnectingGitHubSuccess
  | ConnectingGitHubFail
  | SetGitHubError
  | DisconnectGitHubAccount
  | SetDocSearchResultsDefaultWidth
  | CacheDocSearchResultsWidth
  | SearchInDocPage
  | CancelSearchInDocPage
  | OpenDocsFilterModal
  | CloseDocsFilterModal
  | OpenSignInModal
  | CloseSignInModal
  | FetchDocSourcesSuccess
  | FetchDocSourcesFail
  | SetActiveDocSource
  | SetIsLoadingCachedData
  | ToggleSearchHistoryPreview
  | SetHistory
  | SetHistoryIndex
  | ToggleSearchInputFocus;

interface State {
  search: {
    query: string;
    lastSearchedQuery: string;
    filter: ResultsFilter;
  };
  results: SearchResults;
  modalItem: SearchResultItem | undefined;
  gitHubAccount: {
    isLoading: boolean;
    isConnected: boolean;
    error: string;
  },
  errorMessage: string;
  layout: {
    docSearchResultsDefaultWidth: number;
  }
  isSearchingInDocPage: boolean;
  isDocsFilterModalOpened: boolean;
  docSources: DocSource[];
  activeDocSource?: DocSource;
  isLoadingCachedData: boolean;
  isSignInModalOpened: boolean;
  isSearchHistoryPreviewVisible: boolean;
  history: string[];
  historyIndex: number;
  isSearchInputFocused: boolean;
}

const initialState: State = {
  search: {
    query: '',
    lastSearchedQuery: '',
    // TODO: Since we load the last saved search query we should also load
    // the last saved results filter.
    filter: ResultsFilter.StackOverflow,
  },
  results: {
    [ResultsFilter.StackOverflow]: {
      items: [],
      isLoading: true,
      scrollTopPosition: 0,
      focusedIdx: {
        idx: 0,
        focusState: FocusState.NoScroll,
      },
    },
    [ResultsFilter.GitHubCode]: {
      items: [],
      isLoading: true,
      scrollTopPosition: 0,
      focusedIdx: {
        idx: 0,
        focusState: FocusState.NoScroll,
      },
    },
    [ResultsFilter.Docs]: {
      items: [],
      isLoading: true,
      scrollTopPosition: 0,
      focusedIdx: {
        idx: 0,
        focusState: FocusState.NoScroll,
      },
    },
  },
  modalItem: undefined,
  gitHubAccount: {
    isLoading: false,
    isConnected: false,
    error: '',
  },
  errorMessage: '',
  layout: {
    docSearchResultsDefaultWidth: 200,
  },
  isSearchingInDocPage: false,
  isDocsFilterModalOpened: false,
  docSources: [],
  activeDocSource: undefined,
  isLoadingCachedData: true,
  isSignInModalOpened: false,
  history: [],
  isSearchHistoryPreviewVisible: false,
  historyIndex: 0,
  isSearchInputFocused: true,
}

function stateReducer(state: State, reducerAction: ReducerAction): State {
  if (isDev) {
    console.log(ReducerActionType[reducerAction.type], (reducerAction as any).payload || {}, state);
  }

  switch (reducerAction.type) {
    case ReducerActionType.SetSearchQuery: {
      const { query } = reducerAction.payload;
      return {
        ...state,
        search: {
          ...state.search,
          query,
        },
      };
    }
    case ReducerActionType.ClearResults: {
      const emptyResults = initialState.results;
      // Initial state has the 'isLoading' field set to 'true'
      // for each result filter. We want to set it to 'false'.
      Object.keys(emptyResults).forEach(k => {
        (emptyResults[k as ResultsFilter] as any).isLoading = false;
      });

      return {
        ...state,
        search: {
          ...state.search,
          query: '',
          lastSearchedQuery: '',
        },
        results: {
          ...emptyResults,
        },
      };
    }
    case ReducerActionType.CacheScrollTopPosition: {
      const { filter, scrollTopPosition } = reducerAction.payload;
      return {
        ...state,
        results: {
          ...state.results,
          [filter]: {
            ...state.results[filter],
            scrollTopPosition,
          },
        },
      };
    }
    case ReducerActionType.SetSearchFilter: {
      const { filter } = reducerAction.payload;
      return {
        ...state,
        search: {
          ...state.search,
          filter,
        },
        // TODO: https://github.com/DevbookHQ/devbook/issues/7
        /*
        results: {
          ...state.results,
          [filter]: {
            ...state.results[filter],
            focusedIdx: {
              ...state.results[filter].focusedIdx,
              // We want to disable automatic scrolling to the focused
              // element. When a user is changing filters we should
              // respect the cached scroll position instead. This position
              // might be different then the position of a focused element.
              state: FocusState.NoScroll,
            },
          },
        },
        */
      };
    }
    case ReducerActionType.StartSearching: {
      const { filter } = reducerAction.payload;
      return {
        ...state,
        results: {
          ...state.results,
          [filter]: {
            ...state.results[filter],
            items: [],
            isLoading: true,
          },
        },
      };
    }
    case ReducerActionType.SearchingSuccess: {
      const { filter, items } = reducerAction.payload;
      return {
        ...state,
        search: {
          ...state.search,
          lastSearchedQuery: state.search.query,
        },
        results: {
          ...state.results,
          [filter]: {
            ...state.results[filter],
            isLoading: false,
            items,
            focusedIdx: {
              ...state.results[filter].focusedIdx,
              idx: 0,
              state: FocusState.NoScroll,
            },
          },
        },
      };
    }
    case ReducerActionType.SearchingFail: {
      const { filter, errorMessage } = reducerAction.payload;
      return {
        ...state,
        errorMessage,
        results: {
          ...state.results,
          [filter]: {
            ...state.results[filter],
            isLoading: false,
            items: [],
          },
        },
      };
    }
    case ReducerActionType.FocusResultItem: {
      const { filter, idx, focusState } = reducerAction.payload;
      return {
        ...state,
        results: {
          ...state.results,
          [filter]: {
            ...state.results[filter],
            focusedIdx: {
              ...state.results[filter].focusedIdx,
              idx,
              focusState,
            },
          },
        },
      };
    }
    case ReducerActionType.OpenModal: {
      const { item } = reducerAction.payload;
      return {
        ...state,
        modalItem: item,
      };
    }
    case ReducerActionType.CloseModal: {
      return {
        ...state,
        modalItem: undefined,
      };
    }
    case ReducerActionType.StartConnectingGitHub: {
      return {
        ...state,
        gitHubAccount: {
          ...state.gitHubAccount,
          isLoading: true,
          isConnected: false,
          error: '',
        },
      };
    }
    case ReducerActionType.ConnectingGitHubSuccess: {
      return {
        ...state,
        gitHubAccount: {
          ...state.gitHubAccount,
          isLoading: false,
          isConnected: true,
          error: '',
        },
      };
    }
    case ReducerActionType.ConnectingGitHubFail: {
      const { errorMessage } = reducerAction.payload;
      return {
        ...state,
        gitHubAccount: {
          ...state.gitHubAccount,
          isLoading: false,
          isConnected: false,
          error: errorMessage,
        },
      };
    }
    case ReducerActionType.DisconnectGitHubAccount: {
      return {
        ...state,
        gitHubAccount: {
          ...state.gitHubAccount,
          isLoading: false,
          isConnected: false,
          error: '',
        },
      };
    }
    case ReducerActionType.SetGitHubError: {
      const { message } = reducerAction.payload;
      return {
        ...state,
        gitHubAccount: {
          ...state.gitHubAccount,
          error: message,
        },
      };
    }
    case ReducerActionType.SetDocSearchResultsDefaultWidth: {
      const { width } = reducerAction.payload;
      return {
        ...state,
        layout: {
          ...state.layout,
          docSearchResultsDefaultWidth: width,
        },
      };
    }
    case ReducerActionType.CacheDocSearchResultsWidth: {
      // TODO: Should this be a reducer action?
      // It feels wrong to not do anything with the state
      // and just return it as it is.
      const { width } = reducerAction.payload;
      saveDocSearchResultsDefaultWidth(width);
      return { ...state };
    }
    case ReducerActionType.SearchInDocPage: {
      return {
        ...state,
        isSearchingInDocPage: true,
      };
    }
    case ReducerActionType.CancelSearchInDocPage: {
      return {
        ...state,
        isSearchingInDocPage: false,
      };
    }
    case ReducerActionType.OpenDocsFilterModal: {
      return {
        ...state,
        isDocsFilterModalOpened: true,
      };
    }
    case ReducerActionType.CloseDocsFilterModal: {
      return {
        ...state,
        isDocsFilterModalOpened: false,
      };
    }
    case ReducerActionType.OpenSignInModal: {
      return {
        ...state,
        isSignInModalOpened: true,
      };
    }
    case ReducerActionType.CloseSignInModal: {
      return {
        ...state,
        isSignInModalOpened: false,
      };
    }
    case ReducerActionType.FetchDocSourcesSuccess: {
      const { docSources, activeDocSource } = reducerAction.payload;
      return {
        ...state,
        docSources,
        activeDocSource,
      };
    }
    case ReducerActionType.FetchDocSourcesFail: {
      const { errorMessage } = reducerAction.payload;
      return {
        ...state,
        errorMessage,
      };
    }
    case ReducerActionType.SetActiveDocSource: {
      const { activeDocSource } = reducerAction.payload;
      return {
        ...state,
        activeDocSource,
      };
    }
    case ReducerActionType.SetIsLoadingCachedData: {
      const { isLoadingCachedData } = reducerAction.payload;
      return {
        ...state,
        isLoadingCachedData,
      };
    }
    case ReducerActionType.ToggleSearchInputFocus: {
      const { isFocused } = reducerAction.payload;
      return {
        ...state,
        isSearchInputFocused: isFocused,
      };
    }
    case ReducerActionType.SetHistory: {
      const { history } = reducerAction.payload;
      return {
        ...state,
        history,
      };
    }
    case ReducerActionType.ToggleSearchHistoryPreview: {
      const { isVisible } = reducerAction.payload;
      return {
        ...state,
        isSearchHistoryPreviewVisible: isVisible,
      };
    }
    case ReducerActionType.SetHistoryIndex: {
      const { index } = reducerAction.payload;
      return {
        ...state,
        historyIndex: index,
      };
    }
    default:
      return state;
  }
}

function Home() {
  const authInfo = useContext(AuthContext);

  const isUserLoading =
    authInfo.state === AuthState.LookingForStoredUser ||
    authInfo.state === AuthState.SigningOutUser ||
    authInfo.state === AuthState.SigningInUser;

  const isUserSignedInWithOrWithoutMetadata = authInfo.state === AuthState.UserAndMetadataLoaded;

  const docPageSearchInputRef = useRef<HTMLInputElement>(null);
  const searchResultsWrapperRef = useRef<HTMLDivElement>(null);
  const [state, dispatch] = useReducer(stateReducer, initialState);

  const debouncedQuery = useDebounce(state.search.query.trim(), 400);
  const debouncedLastSearchedQuery = useDebounce(state.search.lastSearchedQuery.trim(), 400);

  const activeFilter = useMemo(() => state.search.filter, [state.search.filter]);

  const activeFocusedIdx = useMemo(() => {
    return state.results[activeFilter].focusedIdx;
  }, [state.results, activeFilter]);

  const activeFocusedItem = useMemo(() => {
    return state.results[activeFilter].items[activeFocusedIdx.idx];
  }, [state.results, activeFilter, activeFocusedIdx]);

  const hasActiveFilterEmptyResults = useMemo(() => {
    return state.results[activeFilter].items.length === 0;
  }, [state.results, activeFilter]);

  const isActiveFilterLoading = useMemo(() => {
    return state.results[activeFilter].isLoading;
  }, [state.results, activeFilter]);

  // Dispatch helpers
  const setSearchQuery = useCallback((query: string) => {
    dispatch({
      type: ReducerActionType.SetSearchQuery,
      payload: { query },
    });
  }, []);

  const cacheScrollTopPosition = useCallback((filter: ResultsFilter, scrollTopPosition: number) => {
    dispatch({
      type: ReducerActionType.CacheScrollTopPosition,
      payload: { filter, scrollTopPosition },
    });
  }, []);

  const clearResults = useCallback(() => {
    dispatch({
      type: ReducerActionType.ClearResults,
    });
  }, []);

  const startSearching = useCallback((filter: ResultsFilter) => {
    dispatch({
      type: ReducerActionType.StartSearching,
      payload: { filter },
    });
  }, []);

  const searchingSuccess = useCallback((filter: ResultsFilter, items: SearchResultItems) => {
    dispatch({
      type: ReducerActionType.SearchingSuccess,
      payload: { filter, items },
    });
  }, []);

  const searchingFail = useCallback((filter: ResultsFilter, errorMessage: string) => {
    dispatch({
      type: ReducerActionType.SearchingFail,
      payload: { filter, errorMessage },
    });
  }, []);

  const focusResultItem = useCallback((filter: ResultsFilter, idx: number, focusState: FocusState) => {
    dispatch({
      type: ReducerActionType.FocusResultItem,
      payload: { filter, idx, focusState },
    });
  }, []);

  const setSearchFilter = useCallback((filter: ResultsFilter) => {
    // TODO: Save the scroll bar's position and load it later.
    // https://github.com/DevbookHQ/devbook/issues/7
    /*
    if (searchResultsWrapperEl?.current) {
      // Cache the scroll bar position for the current active filter.
      const currentScrollTop = searchResultsWrapperEl.current.scrollTop;
      console.log('CURRENT', currentScrollTop);
      cacheScrollTopPosition(state.search.filter, currentScrollTop);

      // Set the scroll bar position for the filter that a user wants
      // to set as an active.
      const newScrollTop = state.results[filter].scrollTopPosition;
      searchResultsWrapperEl.current.scrollTo(0, newScrollTop);
    }
    */

    dispatch({
      type: ReducerActionType.SetSearchFilter,
      payload: { filter },
    });

    // Temporary solution that sets scrollbar's position to the currently
    // focused item for the given filter.
    const idx = state.results[filter].focusedIdx.idx;
    focusResultItem(filter, idx, FocusState.WithScroll);

    cancelSearchInDocPage();
  }, [state.results, focusResultItem]);

  const openModal = useCallback((item: SearchResultItem) => {
    let url = '';
    // TODO: This isn't a very good differentiation.
    // Can we do it better in a more TypeScript way?
    if ((item as StackOverflowResult).question) {
      // Item is StackOverflowResult.
      url = (item as StackOverflowResult).question.link;
    } else if ((item as CodeResult).fileURL) {
      // Item is CodeResult.
      url = (item as CodeResult).fileURL;
    }
    trackModalOpened({
      activeFilter: activeFilter.toString(),
      url,
    });
    dispatch({
      type: ReducerActionType.OpenModal,
      payload: { item },
    });
  }, [activeFilter]);

  const closeModal = useCallback(() => {
    dispatch({
      type: ReducerActionType.CloseModal,
    });
  }, []);

  const startConnectingGitHub = useCallback(() => {
    dispatch({
      type: ReducerActionType.StartConnectingGitHub,
    });
  }, []);

  const connectingGitHubSuccess = useCallback(() => {
    dispatch({
      type: ReducerActionType.ConnectingGitHubSuccess,
    });
  }, []);

  const connectingGitHubFail = useCallback((errorMessage: string) => {
    dispatch({
      type: ReducerActionType.ConnectingGitHubFail,
      payload: { errorMessage },
    });
  }, []);

  const disconnectGitHubAccount = useCallback(() => {
    dispatch({
      type: ReducerActionType.DisconnectGitHubAccount,
    });
  }, []);

  const setGitHubError = useCallback((message: string) => {
    dispatch({
      type: ReducerActionType.SetGitHubError,
      payload: { message },
    });
  }, []);

  const setDocSearchResultsDefaultWidth = useCallback((width: number) => {
    dispatch({
      type: ReducerActionType.SetDocSearchResultsDefaultWidth,
      payload: { width },
    });
  }, []);

  const cacheDocSearchResultsWidth = useCallback((width: number) => {
    dispatch({
      type: ReducerActionType.CacheDocSearchResultsWidth,
      payload: { width },
    });
  }, []);

  const searchInDocPage = useCallback(() => {
    dispatch({
      type: ReducerActionType.SearchInDocPage,
    });
  }, []);

  const cancelSearchInDocPage = useCallback(() => {
    dispatch({
      type: ReducerActionType.CancelSearchInDocPage,
    });
  }, []);

  const openDocsFilterModal = useCallback(() => {
    dispatch({
      type: ReducerActionType.OpenDocsFilterModal,
    });
  }, []);

  const closeDocsFilterModal = useCallback(() => {
    dispatch({
      type: ReducerActionType.CloseDocsFilterModal,
    });
  }, []);

  const openSignInModal = useCallback(() => {
    trackSignInModalOpened();
    dispatch({
      type: ReducerActionType.OpenSignInModal,
    });
  }, []);

  const closeSignInModal = useCallback(() => {
    trackSignInModalClosed();
    dispatch({
      type: ReducerActionType.CloseSignInModal,
    });
  }, []);

  const fetchDocSourcesSuccess = useCallback((docSources: DocSource[], activeDocSource: DocSource) => {
    dispatch({
      type: ReducerActionType.FetchDocSourcesSuccess,
      payload: { docSources, activeDocSource },
    });
  }, []);

  const fetchDocSourcesFail = useCallback((errorMessage: string) => {
    dispatch({
      type: ReducerActionType.FetchDocSourcesFail,
      payload: { errorMessage },
    });
  }, []);

  const setActiveDocSource = useCallback((activeDocSource: DocSource) => {
    dispatch({
      type: ReducerActionType.SetActiveDocSource,
      payload: { activeDocSource },
    });
  }, []);

  const setIsLoadingCachedData = useCallback((isLoadingCachedData: boolean) => {
    dispatch({
      type: ReducerActionType.SetIsLoadingCachedData,
      payload: { isLoadingCachedData },
    });
  }, []);

  const toggleSearchHistoryPreview = useCallback((isVisible: boolean) => {
    if (isVisible) {
      trackShowSearchHistory();
    } else {
      trackHideSearchHistory();
    }
    dispatch({
      type: ReducerActionType.ToggleSearchHistoryPreview,
      payload: { isVisible },
    });
  }, []);

  const setHistoryIndex = useCallback((index: number) => {
    dispatch({
      type: ReducerActionType.SetHistoryIndex,
      payload: { index },
    });
  }, []);

  const toggleSearchInputFocus = useCallback((isFocused: boolean) => {
    dispatch({
      type: ReducerActionType.ToggleSearchInputFocus,
      payload: { isFocused },
    });
  }, []);

  const setHistory = useCallback((history: string[]) => {
    dispatch({
      type: ReducerActionType.SetHistory,
      payload: { history },
    });
  }, []);
  /////////

  const openFocusedSOItemInBrowser = useCallback(() => {
    const idx = state.results[ResultsFilter.StackOverflow].focusedIdx.idx;
    const item = state.results[ResultsFilter.StackOverflow].items[idx] as StackOverflowResult;
    console.log('OPEN IN BROWSER', item);
    if (item) openLink(item.question.link);
  }, [state.results]);

  const openFocusedGitHubCodeItemInVSCode = useCallback(() => {
    const idx = state.results[ResultsFilter.GitHubCode].focusedIdx.idx;
    const item = state.results[ResultsFilter.GitHubCode].items[idx] as CodeResult;
    if (!item) return;
    openFileInVSCode(item.filePath, item.fileContent, item.filePreviews);
  }, [state.results]);

  function openFocusedGitHubCodeItemInBrowser() {
    const idx = state.results[ResultsFilter.GitHubCode].focusedIdx.idx
    const item = state.results[ResultsFilter.GitHubCode].items[idx] as CodeResult;
    const firstPreview = item?.filePreviews[0];
    const gitHubFileURL = firstPreview ? `${item.fileURL}#L${firstPreview.startLine + 3}` : item?.fileURL;
    if (gitHubFileURL) openLink(gitHubFileURL);
  }

  // TODO: Create a reducer action.
  async function openFileInVSCode(path: string, content: string, filePreviews: FilePreview[]) {
    const tmpPath = await createTmpFile({
      filePath: path,
      fileContent: content,
    });
    if (tmpPath) {
      const firstPreview = filePreviews[0];
      const vscodeFileURL = firstPreview ? `vscode://file/${tmpPath}:${firstPreview.startLine + 3}` : `vscode://file/${tmpPath}`;
      await openLink(vscodeFileURL);
    } else {
      // TODO: Handle error for user.
      console.error('Cannot create tmp file with the file content.')
    }
  }

  async function searchGHCode(query: string) {
    try {
      startSearching(ResultsFilter.GitHubCode);
      const results = await searchGitHubCode(query);
      searchingSuccess(ResultsFilter.GitHubCode, results);
    } catch (error) {
      searchingFail(ResultsFilter.GitHubCode, error.message);
    }
  }

  async function searchSO(query: string) {
    try {
      startSearching(ResultsFilter.StackOverflow);
      const results = await searchStackOverflow(query);
      searchingSuccess(ResultsFilter.StackOverflow, results);
    } catch (error) {
      searchingFail(ResultsFilter.StackOverflow, error.message);
    }
  }

  async function searchDocs(query: string, docSources: DocSource[]) {
    // User has all doc sources unincluded.
    if (!state.activeDocSource) {
      searchingSuccess(ResultsFilter.Docs, []);
      return;
    }

    try {
      startSearching(ResultsFilter.Docs);
      const results = await searchDocumentations(query, docSources);
      searchingSuccess(ResultsFilter.Docs, results);
    } catch (error) {
      searchingFail(ResultsFilter.Docs, error.message);
    }
  }

  async function searchAll(query: string, filter: ResultsFilter, isGitHubConnected: boolean, docSources: DocSource[]) {
    switch (filter) {
      case ResultsFilter.StackOverflow:
        await searchSO(query);
        await searchDocs(query, docSources);
        if (isGitHubConnected) {
          await searchGHCode(query);
        } else {
          // We do this so the 'isLoading' field for GitHubCode is set to false.
          searchingSuccess(ResultsFilter.GitHubCode, []);
        }
        break;

      case ResultsFilter.GitHubCode:
        if (isGitHubConnected) {
          await searchGHCode(query);
        } else {
          // We do this so the 'isLoading' field for GitHubCode is set to false.
          searchingSuccess(ResultsFilter.GitHubCode, []);
        }
        await searchSO(query);
        await searchDocs(query, docSources);
        break;

      case ResultsFilter.Docs:
        await searchDocs(query, docSources);
        await searchSO(query);
        if (isGitHubConnected) {
          await searchGHCode(query);
        } else {
          // We do this so the 'isLoading' field for GitHubCode is set to false.
          searchingSuccess(ResultsFilter.GitHubCode, []);
        }
        break;
    }
  }

  async function tryToLoadGitHubAccount() {
    try {
      startConnectingGitHub();
      await initGitHub();
      connectingGitHubSuccess();
    } catch (error) {
      if (error.message !== 'No access token found') {
        connectingGitHubFail(error.message);
      }
    }
  }

  function handleSearchInputChange(value: string) {
    // User explicitely deleted the query. We should remove all results.
    if (!value) {
      clearResults();
      return;
    }
    setSearchQuery(value);
  }

  function handleDocSearchResultsResizeStop(e: any, dir: any, elRef: HTMLElement) {
    cacheDocSearchResultsWidth(elRef.clientWidth);
  }

  function handleDocSourceSelect(docSource: DocSource) {
    setActiveDocSource(docSource);
  }

  function navigateSearchResultsUp(idx: number, filter: ResultsFilter, isModalOpened: boolean) {
    if (isModalOpened) return; // In an active modal, arrow keys scroll the scrollbar and not navigate results.

    if (idx > 0) {
      focusResultItem(filter, idx - 1, FocusState.WithScroll);
    }
  }

  function navigateSearchResultsDown(idx: number, filter: ResultsFilter, isModalOpened: boolean) {
    if (isModalOpened) return;

    if (idx < state.results[filter].items.length - 1) {
      focusResultItem(filter, idx + 1, FocusState.WithScroll);
    }
  }

  function handleSearchHistoryQueryClick(query: string) {
    setSearchQuery(query);
    toggleSearchHistoryPreview(false);
    trackSelectHistoryQuery();
  }

  /* HOTKEYS */
  // 'cmd+1' hotkey - change search filter to SO questions.
  useHotkeys(electron.remote.process.platform === 'darwin' ? 'Cmd+1' : 'alt+1', () => {
    if (state.modalItem) return;
    setSearchFilter(ResultsFilter.StackOverflow);
    trackShortcut({ action: 'Change filter to SO' });
  }, { filter: () => true }, [state.modalItem, setSearchFilter]);

  // 'cmd+2' hotkey - change search filter to GitHub Code search.
  useHotkeys(electron.remote.process.platform === 'darwin' ? 'Cmd+2' : 'alt+2', () => {
    if (state.modalItem) return;
    setSearchFilter(ResultsFilter.GitHubCode);
    trackShortcut({ action: 'Change filter to Code' });
  }, { filter: () => true }, [state.modalItem, setSearchFilter]);

  // 'cmd+3' hotkey - change search filter to Docs search.
  useHotkeys(electron.remote.process.platform === 'darwin' ? 'Cmd+3' : 'alt+3', () => {
    if (state.modalItem) return;
    setSearchFilter(ResultsFilter.Docs);
    trackShortcut({ action: 'Change filter to Docs' });
  }, { filter: () => true }, [state.modalItem, setSearchFilter]);

  // 'shift + up arrow' - navigate docs search results.
  useHotkeys('shift+up', () => {
    // Emulate natural scrolling.
    if (activeFilter === ResultsFilter.StackOverflow ||
        activeFilter === ResultsFilter.GitHubCode
        // Natural scrolling for docs is handled inside the DocPage component.
    ) {
      if (!searchResultsWrapperRef?.current) return;
      const isModalOpened = !!state.modalItem || state.isDocsFilterModalOpened;
      if (isModalOpened) return;

      searchResultsWrapperRef.current.scrollBy(0, -15);
    }
  }, { filter: () => true }, [state.results, activeFilter, state.modalItem, state.isDocsFilterModalOpened]);

  // 'shift + down arrow' - navigate docs search results.
  useHotkeys('shift+down', () => {
    // Emulate natural scrolling.
    if (activeFilter === ResultsFilter.StackOverflow ||
        activeFilter === ResultsFilter.GitHubCode
        // Natural scrolling for docs is handled inside the DocPage component.
    ) {
      if (!searchResultsWrapperRef?.current) return;
      const isModalOpened = !!state.modalItem || state.isDocsFilterModalOpened;
      if (isModalOpened) return;

      searchResultsWrapperRef.current.scrollBy(0, 15);
    }
  }, { filter: () => true }, [state.results, activeFilter, state.modalItem, state.isDocsFilterModalOpened]);

  // 'up arrow' hotkey - navigation.
  useHotkeys('up', (event) => {
    if (state.isSearchHistoryPreviewVisible) {
      event.preventDefault(); // This prevents natural scrolling using arrow keys.
      if (state.historyIndex > 0) {
        setHistoryIndex(state.historyIndex - 1);
      }
      return;
    }

    const isModalOpened = !!state.modalItem || state.isDocsFilterModalOpened;
    if (!isModalOpened) {
      event.preventDefault(); // This prevents natural scrolling using arrow keys.
    }
    const idx = state.results[activeFilter].focusedIdx.idx;
    navigateSearchResultsUp(idx, activeFilter, isModalOpened);
  }, { filter: () => true }, [
    state.results,
    activeFilter,
    state.modalItem,
    state.isSearchHistoryPreviewVisible,
    state.historyIndex,
    setHistoryIndex,
  ]);

  // 'down arrow' hotkey - navigation.
  useHotkeys('down', (event) => {
    if (state.isSearchHistoryPreviewVisible) {
      event.preventDefault(); // This prevents natural scrolling using arrow keys.
      if (state.historyIndex < state.history.length - 1) {
        setHistoryIndex(state.historyIndex + 1);
      }
      return;
    }

    const isModalOpened = !!state.modalItem || state.isDocsFilterModalOpened;
    if (!isModalOpened) {
      event.preventDefault(); // This prevents natural scrolling using arrow keys.
    }
    const idx = state.results[activeFilter].focusedIdx.idx;
    navigateSearchResultsDown(idx, activeFilter, isModalOpened);
  }, { filter: () => true }, [
    state.results,
    activeFilter,
    state.modalItem,
    state.isSearchHistoryPreviewVisible,
    state.historyIndex,
    state.history,
  ]);

  // 'enter' hotkey - open the focused result in a modal.
  useHotkeys('enter', () => {
    if (state.isSearchHistoryPreviewVisible) {
      setSearchQuery(state.history[state.historyIndex]);
      toggleSearchHistoryPreview(false);
      trackSelectHistoryQuery();
      return;
    }

    if (activeFilter === ResultsFilter.Docs) return;

    openModal(state.results[activeFilter].items[activeFocusedIdx.idx]);
    trackShortcut({ action: 'Open modal' });
  }, [
    state.results,
    activeFilter,
    activeFocusedIdx,
    state.isSearchHistoryPreviewVisible,
    state.history,
    state.historyIndex,
    toggleSearchHistoryPreview,
  ]);


  // 'esc' hotkey - close modal or hide main window.
  useHotkeys('esc', () => {
    if (state.modalItem) {
      closeModal();
      trackShortcut({ action: 'Close modal' });
      return;
    }

    if (state.isSearchingInDocPage) {
      cancelSearchInDocPage();
      trackShortcut({ action: 'Cancel search in doc page' });
      return;
    }

    if (state.isDocsFilterModalOpened) {
      closeDocsFilterModal();
      trackShortcut({ action: 'Close docs filter modal' });
      return;
    }

    if (state.isSignInModalOpened) {
      closeSignInModal();
      return;
    }

    hideMainWindow();
    trackShortcut({ action: 'Hide main window' });
  }, [
    state.modalItem,
    state.isSearchingInDocPage,
    state.isDocsFilterModalOpened,
    state.isSignInModalOpened,
  ]);

  // 'cmd+o' hotkey - open the focused result in a browser.
  useHotkeys(electron.remote.process.platform === 'darwin' ? 'Cmd+o' : 'alt+o', () => {
    switch (activeFilter) {
      case ResultsFilter.StackOverflow:
        openFocusedSOItemInBrowser();
        trackShortcut({ action: 'Open SO item in browser' });
        break;
      case ResultsFilter.GitHubCode:
        openFocusedGitHubCodeItemInBrowser();
        trackShortcut({ action: 'Open Code item in browser' });
        break;
    }
  }, [activeFilter, openFocusedGitHubCodeItemInBrowser, openFocusedGitHubCodeItemInBrowser]);

  // 'cmd+i' hotkey - open the GitHubCode result in a vscode.
  useHotkeys(electron.remote.process.platform === 'darwin' ? 'Cmd+i' : 'alt+i', () => {
    if (activeFilter === ResultsFilter.GitHubCode) {
      openFocusedGitHubCodeItemInVSCode();
      trackShortcut({ action: 'Open code in VSCode' });
    }
  }, [activeFilter, openFocusedGitHubCodeItemInVSCode]);

  // 'cmd+f' hotkey - search in a doc page.
  useHotkeys(electron.remote.process.platform === 'darwin' ? 'Cmd+f' : 'ctrl+f', () => {
    if (activeFilter !== ResultsFilter.Docs) return;
    if (state.isDocsFilterModalOpened) return;

    searchInDocPage();
    docPageSearchInputRef?.current?.focus();
    trackShortcut({ action: 'Search in doc page' });
  }, [activeFilter, searchInDocPage, state.isDocsFilterModalOpened]);

  // 'cmd+d' hotkey - open docs filter modal.
  useHotkeys(electron.remote.process.platform === 'darwin' ? 'Cmd+d' : 'ctrl+d', (e) => {
    e.preventDefault();

    // A search filter different from Docs is active.
    if (activeFilter !== ResultsFilter.Docs) return;
    // Docs search filter is active but user isn't signed in.
    if (activeFilter === ResultsFilter.Docs && !isUserSignedInWithOrWithoutMetadata) return;

    if (state.isDocsFilterModalOpened) closeDocsFilterModal();
    else openDocsFilterModal();
    trackShortcut({ action: 'Filter docs' });
  }, [
    activeFilter,
    state.isDocsFilterModalOpened,
    isUserSignedInWithOrWithoutMetadata,
  ]);

  // Tab to show search history preview.
  useHotkeys('tab', (event) => {
    event.preventDefault();
    toggleSearchHistoryPreview(!state.isSearchHistoryPreviewVisible);
  }, { filter: () => true }, [toggleSearchHistoryPreview, state.isSearchHistoryPreviewVisible]);
  /* //////////////////// */

  useIPCRenderer(IPCMessage.OpenSignInModal, () => {
    openSignInModal();
  });

  useIPCRenderer('github-access-token', (_, { accessToken }: { accessToken: string | null }) => {
    if (accessToken === null) {
      disconnectGitHub();
      disconnectGitHubAccount(); // The state reducer's action.
      return;
    }
    tryToLoadGitHubAccount();
    if (debouncedQuery) searchGHCode(debouncedQuery);
  }, [debouncedQuery]);

  useIPCRenderer('github-error', (_, { message }: { message: string }) => {
    setGitHubError(message);
  });

  // Run only on the initial render.
  // Get the cached search query and search filter.
  // Try to load GitHub account if user linked their
  // GitHub in the past.
  useEffect(() => {
    async function loadCachedData() {
      const width = await getDocSearchResultsDefaultWidth();
      setDocSearchResultsDefaultWidth(width);

      const filter = await getSavedSearchFilter();
      setSearchFilter(filter);

      const lastQuery = await getSavedSearchQuery();
      if (!lastQuery) {
        // We do this so the 'isLoading' field is set to false
        // for each search filter.
        searchingSuccess(ResultsFilter.StackOverflow, []);
        searchingSuccess(ResultsFilter.GitHubCode, []);
        searchingSuccess(ResultsFilter.Docs, []);
      } else {
        setSearchQuery(lastQuery);
      }

      try {
        const allDocSources = await fetchDocSources();
        let activeDocSource = await getActiveDocSource();
        if (!activeDocSource || !allDocSources.map(ds => ds.slug).includes(activeDocSource.slug)) {
          activeDocSource = allDocSources[0];
        }
        fetchDocSourcesSuccess(allDocSources, activeDocSource);
      } catch (err) {
        fetchDocSourcesFail(err);
      }

      setIsLoadingCachedData(false);
    }
    loadCachedData();
    tryToLoadGitHubAccount();
    // We want to run this only during the first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Log error messages.
  useEffect(() => {
    if (!state.errorMessage) return;
    console.error(state.errorMessage);
  }, [state.errorMessage]);

  // Search when the debounced query changes.
  useEffect(() => {
    setHistory(historyStore.queries);
    if (!debouncedQuery || debouncedQuery === debouncedLastSearchedQuery) return;

    searchAll(
      debouncedQuery,
      activeFilter,
      state.gitHubAccount.isConnected,
      [state.activeDocSource ?? state.docSources[0]],
    );

    historyStore.saveDebouncedQuery(debouncedQuery);

    trackSearch({
      activeFilter: activeFilter.toString(),
      query: debouncedQuery,
      activeDocSource: state.activeDocSource,
    });
    // TODO WARNING - Don't include 'searchAll' in the deps array
    // otherwise an infinite cycle will start. Why?
    // Answer - `searchAll` function is defined in the body of the component
    // and with each rerender it is defined again, thus having a new identity and triggering deps change.
  }, [
    debouncedQuery,
    debouncedLastSearchedQuery,
    activeFilter,
    state.gitHubAccount.isConnected,
    state.activeDocSource,
    state.docSources,
    setHistory,
  ]);

  // Cache the debounced query.
  useEffect(() => {
    if (debouncedQuery !== debouncedLastSearchedQuery) {
      saveSearchQuery(debouncedQuery);
    }
  }, [debouncedQuery, debouncedLastSearchedQuery]);

  // Cache the currently active filter.
  useEffect(() => {
    if (state.isLoadingCachedData) return;
    saveSearchFilter(activeFilter);
  }, [activeFilter, state.isLoadingCachedData]);

  // Cache the doc sources and search again when user selects new doc source.
  useEffect(() => {
    if (!state.activeDocSource) return;
    saveActiveDocSource(state.activeDocSource);

    if (debouncedQuery) {
      searchDocs(debouncedQuery, [state.activeDocSource]);
    }

    // NOTE: We don't want to run this useEffect every time
    // the search query changes. We just want to refresh
    // the docs results when user changes what doc sources
    // they want to have active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeDocSource]);

  useEffect(() => {
    refreshAuth();
  }, []);

  return (
    <>
      {state.modalItem && activeFilter === ResultsFilter.StackOverflow &&
        <StackOverflowModal
          soResult={state.modalItem as StackOverflowResult}
          onOpenInBrowserClick={openFocusedSOItemInBrowser}
          onCloseRequest={closeModal}
        />
      }

      {state.modalItem && activeFilter === ResultsFilter.GitHubCode &&
        <CodeModal
          codeResult={state.modalItem as CodeResult}
          onCloseRequest={closeModal}
          onOpenInBrowserClick={openFocusedGitHubCodeItemInBrowser}
          onOpenInVSCodeClick={openFocusedGitHubCodeItemInVSCode}
        />
      }

      {state.isDocsFilterModalOpened && activeFilter === ResultsFilter.Docs &&
        <DocsFilterModal
          docSources={state.docSources}
          onDocSourceSelect={handleDocSourceSelect}
          onCloseRequest={closeDocsFilterModal}
        />
      }

      {state.isSignInModalOpened &&
        <SignInModal
          onCloseRequest={closeSignInModal}
        />
      }

      {state.isSearchHistoryPreviewVisible &&
        <SearchHistory
          isFocused
          historyIdx={state.historyIndex}
          history={state.history}
          onQueryClick={handleSearchHistoryQueryClick}
          onHideHotkeyClick={() => toggleSearchHistoryPreview(false)}
        />
      }

      <Container>
        <SearchHeaderPanel
          value={state.search.query}
          placeholder="Search StackOverflow, code on GitHub, and docs"
          onChange={handleSearchInputChange}
          activeFilter={activeFilter}
          onFilterSelect={f => setSearchFilter(f)}
          isLoading={isActiveFilterLoading}
          isModalOpened={!!state.modalItem}
          isSignInModalOpened={state.isSignInModalOpened}
          isDocsFilterModalOpened={state.isDocsFilterModalOpened}
          onInputFocusChange={toggleSearchInputFocus}
          onToggleSearchHistoryClick={() => toggleSearchHistoryPreview(!state.isSearchHistoryPreviewVisible)}
        />

        {!state.search.query
          // We don't want to show this if users selected GitHubCode filter
          // and haven't connected their GitHub account yet.
          && (state.gitHubAccount.isConnected || activeFilter !== ResultsFilter.GitHubCode)
          && !isActiveFilterLoading
          &&
          <>
            {/*
              We can show the text right away for SO and GitHubCode because
              we don't have to wait until a user account is loaded.
            */}

            {activeFilter === ResultsFilter.Docs
              && (authInfo.state === AuthState.UserAndMetadataLoaded)
              &&
              <InfoMessage>Type your search query</InfoMessage>
            }

            {activeFilter !== ResultsFilter.Docs
              &&
              <InfoMessage>Type your search query</InfoMessage>
            }
          </>
        }

        {state.search.query
          // We don't want to show this if users selected GitHubCode filter
          // and haven't connected their GitHub account yet.
          && (state.gitHubAccount.isConnected || activeFilter !== ResultsFilter.GitHubCode)
          && hasActiveFilterEmptyResults
          && !isActiveFilterLoading
          // Don't show "Nothing found" when user is searching docs but disabled
          // all doc sources.
          && !(activeFilter === ResultsFilter.Docs && (!state.activeDocSource || !isUserSignedInWithOrWithoutMetadata))
          &&
          <InfoMessage>Nothing found</InfoMessage>
        }

        {activeFilter === ResultsFilter.GitHubCode
          && !state.gitHubAccount.isConnected
          &&
          <GitHubConnect>
            <GitHubConnectTitle>
              Connect your GitHub account to search on GitHub
            </GitHubConnectTitle>
            <ConnectGitHubButton onClick={connectGitHub}>
              Connect my GitHub account
            </ConnectGitHubButton>
            {state.gitHubAccount.error &&
              <GitHubError>{state.gitHubAccount.error}</GitHubError>
            }
            {/* <GitHubPrivacyLink onClick={openPrivacyTerms}>
              Read more about privacy and what access Devbook needs
            </GitHubPrivacyLink> */}
          </GitHubConnect>
        }

        {activeFilter === ResultsFilter.Docs
          && authInfo.state === AuthState.LookingForStoredUser
          &&
          <DocsLoader />
        }

        {activeFilter === ResultsFilter.Docs
          && authInfo.state === AuthState.SigningInUser
          &&
          <>
            <DocsLoader />
            <InfoMessage>
              You're being signed in. Please check your email.
              </InfoMessage>
            <SignInAgainButton
              onClick={openSignInModal}
            >
              Sign in with a different email
              </SignInAgainButton>
          </>
        }

        {activeFilter === ResultsFilter.Docs
          && !isUserLoading
          && !isUserSignedInWithOrWithoutMetadata
          &&
          <>
            <InfoMessage>You need to sign in to search documentations</InfoMessage>
            <SignInButton
              onClick={openSignInModal}
            >
              Sign in to Devbook
            </SignInButton>
          </>
        }

        {state.search.query
          && activeFilter === ResultsFilter.Docs
          && isUserSignedInWithOrWithoutMetadata
          && !state.activeDocSource
          && !isActiveFilterLoading
          &&
          <>
            <InfoMessage>No documentation is enabled</InfoMessage>
            <EnableDocSourcesButton
              onClick={openDocsFilterModal}
            >
              Enable documentations
            </EnableDocSourcesButton>
          </>
        }

        {state.search.query
          && !hasActiveFilterEmptyResults
          && !isActiveFilterLoading
          &&
          <>
            {(activeFilter === ResultsFilter.StackOverflow || activeFilter === ResultsFilter.GitHubCode) &&
              <SearchResultsWrapper
                ref={searchResultsWrapperRef}
              >
                {activeFilter === ResultsFilter.StackOverflow
                  && (state.results[ResultsFilter.StackOverflow].items as StackOverflowResult[]).map((sor, idx) => (
                    <StackOverflowItem
                      key={idx}
                      soResult={sor}
                      focusState={activeFocusedIdx.idx === idx ? activeFocusedIdx.focusState : FocusState.None}
                      onHeaderClick={() => focusResultItem(ResultsFilter.StackOverflow, idx, FocusState.NoScroll)}
                      onTitleClick={() => openModal(sor)}
                    />
                  ))}

                {activeFilter === ResultsFilter.GitHubCode
                  && state.gitHubAccount.isConnected
                  && (state.results[ResultsFilter.GitHubCode].items as CodeResult[]).map((cr, idx) => (
                    <CodeItem
                      key={idx}
                      codeResult={cr}
                      focusState={activeFocusedIdx.idx === idx ? activeFocusedIdx.focusState : FocusState.None}
                      onHeaderClick={() => focusResultItem(ResultsFilter.GitHubCode, idx, FocusState.NoScroll)}
                      onFilePathClick={() => openModal(cr)}
                    />
                  ))}
              </SearchResultsWrapper>
            }

            {activeFilter === ResultsFilter.Docs
              && state.activeDocSource
              && isUserSignedInWithOrWithoutMetadata
              &&
              <DocsWrapper>
                <Resizable
                  defaultSize={{
                    width: state.layout.docSearchResultsDefaultWidth,
                    height: "100%"
                  }}
                  maxWidth="50%"
                  minWidth="265"
                  enable={{ right: true }}
                  onResizeStop={(e, dir, ref) => handleDocSearchResultsResizeStop(e, dir, ref)}
                >
                  <DocsResultsWrapper>
                    <ActiveDocset>
                      <DocsetNameLogo>
                        <DocsetLogo src={jsLogo}/>
                        <ActiveDocsetName>
                          {state.activeDocSource.name}
                        </ActiveDocsetName>
                      </DocsetNameLogo>
                      <HotkeyWrapper
                        onClick={openDocsFilterModal}
                      >
                        <Hotkey
                          hotkey={electron.remote.process.platform === 'darwin'
                            ? [Key.Command, 'D']
                            : ['CTRL', 'D']
                          }
                        />
                        <HotkeyText>
                          to change
                        </HotkeyText>
                      </HotkeyWrapper>
                    </ActiveDocset>
                    <DocSearchResults>
                      {(state.results[ResultsFilter.Docs].items as DocResult[]).map((d, idx) => (
                        <DocSearchResultItem
                          key={idx}
                          docResult={d}
                          focusState={activeFocusedIdx.idx === idx ? activeFocusedIdx.focusState : FocusState.None}
                          onClick={() => focusResultItem(ResultsFilter.Docs, idx, FocusState.NoScroll)}
                        />
                      ))}
                    </DocSearchResults>
                  </DocsResultsWrapper>
                </Resizable>
                <DocPage
                  isDocsFilterModalOpened={state.isDocsFilterModalOpened}
                  isSearchingInDocPage={state.isSearchingInDocPage}
                  pageURL={(activeFocusedItem as DocResult).page.pageURL}
                  html={(activeFocusedItem as DocResult).page.html}
                  hasHTMLExtension={(activeFocusedItem as DocResult).page.hasHTMLExtension}
                  searchInputRef={docPageSearchInputRef}
                  isSearchHistoryOpened={state.isSearchHistoryPreviewVisible}
                />
              </DocsWrapper>
            }

            {/* StackOverflow search results hotkeys */}
            {!state.modalItem && activeFilter === ResultsFilter.StackOverflow &&
              <StackOverflowSearchHotkeysPanel
                onOpenClick={() => openModal(activeFocusedItem)}
                onOpenInBrowserClick={openFocusedSOItemInBrowser}
                onNavigateUpClick={() => navigateSearchResultsUp(
                  state.results[ResultsFilter.StackOverflow].focusedIdx.idx,
                  ResultsFilter.StackOverflow,
                  false,
                )}
                onNavigateDownClick={() => navigateSearchResultsDown(
                  state.results[ResultsFilter.StackOverflow].focusedIdx.idx,
                  ResultsFilter.StackOverflow,
                  false,
                )}
              />
            }
            {/*-------------------------------------------------------------*/}

            {/* GitHub search results hotkeys */}
            {!state.modalItem
              && activeFilter === ResultsFilter.GitHubCode
              && state.gitHubAccount.isConnected
              &&
              <GitHubCodeSearchHotkeysPanel
                onOpenClick={() => openModal(activeFocusedItem)}
                onOpenInVSCodeClick={openFocusedGitHubCodeItemInVSCode}
                onOpenInBrowserClick={openFocusedGitHubCodeItemInBrowser}
                onNavigateUpClick={() => navigateSearchResultsUp(
                  state.results[ResultsFilter.GitHubCode].focusedIdx.idx,
                  ResultsFilter.GitHubCode,
                  false,
                )}
                onNavigateDownClick={() => navigateSearchResultsDown(
                  state.results[ResultsFilter.GitHubCode].focusedIdx.idx,
                  ResultsFilter.GitHubCode,
                  false,
                )}
              />
            }
            {/*-------------------------------------------------------------*/}

            {/* Docs search results hotkeys */}
            {!state.modalItem
              && activeFilter === ResultsFilter.Docs
              && isUserSignedInWithOrWithoutMetadata
              && state.activeDocSource
              &&
              <DocsSearchHotkeysPanel
                onNavigateUpClick={() => navigateSearchResultsUp(
                  state.results[ResultsFilter.Docs].focusedIdx.idx,
                  ResultsFilter.Docs,
                  false,
                )}
                onNavigateDownClick={() => navigateSearchResultsDown(
                  state.results[ResultsFilter.Docs].focusedIdx.idx,
                  ResultsFilter.Docs,
                  false,
                )}
                isDocsFilterModalOpened={state.isDocsFilterModalOpened}
                isSearchingInDocPage={state.isSearchingInDocPage}
                onCloseFilterDocsClick={closeDocsFilterModal}
                onSearchInDocPageClick={searchInDocPage}
                onCancelSearchInDocPageClick={cancelSearchInDocPage}
              />
            }
            {/*-------------------------------------------------------------*/}
          </>
        }
      </Container>
    </>
  );
}

export default Home;
