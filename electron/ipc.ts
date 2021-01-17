export enum IPCMessage {
  GetCachedDocSources = 'GetCachedDocSources',
  SaveDocSources = 'SaveDocSources',
  GoToPreferencesPage = 'GoToPreferencesPage',
  ChangeUserInMain = 'ChangeUserInMain',
  OpenSignInModal = 'OpenSignInModal',
  SignOut = 'SignOut',
  GetAuthFromMainWindow = 'GetAuthFromMainWindow',
  SetAuthInOtherWindows = 'SetAuthInOtherWindows',

  TrackSignInModalOpened = 'TrackSignInModalOpened',
  TrackSignInModalClosed = 'TrackSignInModalClosed',
  TrackSignInButtonClicked = 'TrackSignInButtonClicked',
  TrackSignInAgainButtonClicked = 'TrackSignInAgainButtonClicked',
  TrackSignInFinished = 'TrackSignInFinished',
  TrackSignInFailed = 'TrackSignInFailed',
  TrackContinueIntoAppButtonClicked = 'TrackContinueIntoAppButtonClicked',
  TrackSignOutButtonClicked = 'TrackSignOutButtonClicked',
}
