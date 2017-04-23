(function(){
  var GIT_LATEST_URL_KEY = 'git.latestUrl';
  var GIT_USER_NAME_KEY = 'github.userName';
  var GIT_EMAIL_KEY = 'github.email';
  var GIT_CREDENTIALS_KEY = 'github.credentials';

  /**
   * @type {CommitAction}
   */
  var commitAction;
  var loginManager = new GitHubLoginManager();

  /**
   *
   * @constructor
   */
  var GitHubErrorReporter = function() {
    this.errDialog = null;
  };

  var COMMIT_STATUS_TITLE = tr(msgs.COMMIT_STATUS_TITLE_);

  /**
   * A function which returns a git access object.
   * @name GitAccessProvider
   * @function
   * @return {syncGit.SyncGitApiBase} A git access object.
   */

  /**
   * Shows an error dialog.
   * @param {string} title The title of the dialog.
   * @param {string} bodyHtml The HTML content of the dialog.
   * @param {string|object[]} buttonConfiguration The button configuration
   */
  GitHubErrorReporter.prototype.showError = function(title, bodyHtml, buttonConfiguration) {
    var dialog = this.getErrorDialog(buttonConfiguration);
    dialog.setTitle(title);
    var dialogElement = dialog.getElement();
    dialogElement.style.textAlign = 'center';
    if (goog.dom.isNodeLike(bodyHtml)) {
      dialogElement.innerHTML = '';
      goog.dom.appendChild(dialogElement, bodyHtml);
    } else if (typeof(bodyHtml) === 'string') {
      dialogElement.innerHTML = bodyHtml;
    }
    dialog.show();
  };

  /**
   * Sets the on submit function. It will only be called once.
   * @param {function} callback The method to call when the user submits the dialog.
   */
  GitHubErrorReporter.prototype.onSelect = function (callback) {
    var self = this;
    self.errDialog.onSelect(callback);
  };

  /**
   * Hides the error dialog
   */
  GitHubErrorReporter.prototype.hide = function () {
    this.errDialog.hide();
  };

  /**
   * Create and return the commit error dialog.
   *
   * @param {Object} buttonConfiguration The button configuration
   * @return {sync.api.Dialog} The error message dialog.
   */
  GitHubErrorReporter.prototype.getErrorDialog = function(buttonConfiguration) {
    if (!this.errDialog) {
      this.errDialog = workspace.createDialog();
    }
    this.errDialog.setButtonConfiguration(buttonConfiguration);
    return this.errDialog;
  };

  var errorReporter = new GitHubErrorReporter();

  /**
   * The Log out action for Github
   *
   * @constructor
   */
  function LogOutAction (editor) {
    this.editor = editor;
  }
  goog.inherits(LogOutAction, sync.actions.AbstractAction);

  /** @override */
  LogOutAction.prototype.renderLargeIcon = function() {
    return null;
  };

  /** @override */
  LogOutAction.prototype.renderSmallIcon = function() {
    return null;
  };

  /**
   * Constructs and returns the log-out confirmation dialog.
   *
   * @return {sync.api.Dialog} The dialog used to confirm teh log-out action.
   */
  LogOutAction.prototype.getDialog = function() {
    if (!this.dialog) {
      this.dialog = workspace.createDialog();
      this.dialog.setTitle(tr(msgs.LOGOUT_));
      this.dialog.setButtonConfiguration([
          {key: 'yes', caption: tr(msgs.LOGOUT_)},
          {key: 'no', caption: tr(msgs.CANCEL_)}]);

      var warning = tr(msgs.GIT_LOGOUT_WARNING_);
      var content = warning;
      warning = warning.split('{$LINE_BREAK}');
      if (warning) {
        content = [warning[0], goog.dom.createDom('br'), warning[1]];
      }
      var dialogContent = goog.dom.createDom('div', '', goog.dom.createDom('div', '', content));
      goog.dom.appendChild(this.dialog.getElement(), dialogContent);
    }
    return this.dialog;
  };

  /**
   * Called when the Logout button is clicked
   *
   * @override
   */
  LogOutAction.prototype.actionPerformed = function() {
    this.dialog = this.getDialog();

    this.dialog.onSelect(goog.bind(function (actionName) {
      if (actionName == 'yes') {
        clearGithubCredentials();
        this.editor && this.editor.setDirty(false);
        window.location.reload();
      }

    }, this));

    this.showDialog();
    this.dialog.setPreferredSize(320, 185);
  };

  /** @override */
  LogOutAction.prototype.getDisplayName = function() {
    return tr(msgs.LOGOUT_);
  };

  /** @override */
  LogOutAction.prototype.getDescription = function() {
    return "Git " + tr(msgs.LOGOUT_);
  };

  /**
   * Shows the logout dialog.
   */
  LogOutAction.prototype.showDialog = function() {
    this.dialog.show();
  };

  /**
   * The commit action for GitHub.
   *
   * @param {sync.api.Editor} editor The editor on which this action applies.
   * @param {GitAccessProvider} gitAccess Provides access to misc repository commands.
   * @param {object} fileLocation An object describind the location of the opened file.
   *
   * @constructor
   */
  var CommitAction = function(editor, gitAccess, fileLocation) {
    sync.actions.AbstractAction.call(this);
    this.editor = editor;

    /**
     * Used to access miscellaneous repository commands such as forking.
     * @type {GitAccessProvider}
     * @private
     */
    this.gitAccess_ = gitAccess;

    /**
     * Holds information about the location of the edited document.
     * @type {Object}
     * @private
     */
    this.fileLocation_ = fileLocation;

    if (gitAccess() instanceof syncGit.SyncGithubApi) {
      this.github = gitAccess().getGithub();
      this.repo = gitAccess().getGithubRepo_(fileLocation.repositoryUri);
    }

    this.branch = fileLocation.branch;
    this.filePath = fileLocation.filePath;

    this.dialog = null;
    this.iconWrapper = null;

    this.status = 'none';
    this.githubToolbarButton = null;
    this.statusTimeout = null;

    /**
     * The list of branches for the current document's owner and repository
     * @type {Array<string>}
     */
    this.branchesList = null;
  };
  goog.inherits(CommitAction, sync.actions.AbstractAction);

  /**
   * The key stroke which should invoke the commit action.
   * @type {string}
   */
  CommitAction.SHORTCUT = 'M1 S';

  /**
   * The id of the commit action used by the actions manager.
   * @type {string}
   */
  CommitAction.ID = 'Git/Commit';

  /**
   * The default value for the pull request title.
   * @type {string}
   */
  CommitAction.DEFAULT_PULL_TITLE = tr(msgs.GIT_PULL_TITLE_, {'$APP_NAME': tr(msgs.WEB_AUTHOR_NAME_)});

  /**
   * The default value for the commit message.
   * @type {string}
   */
  CommitAction.DEFAULT_COMMIT_MESSAGE = tr(msgs.GIT_DEFAULT_COMMIT_MESSAGE_, {'$APP_NAME': tr(msgs.WEB_AUTHOR_NAME_)});

  /**
   * Gets the content of the file asynchronously.
   *
   * @param {function(string)} cb The callback that will receive the file content.
   */
  CommitAction.prototype.getContent = function(cb) {
    this.editor.getXmlContent(cb);
  };

  /**
   * Sets the git access provider used to access git repositories.
   * @param {GitAccessProvider} gitAccess Used to access git repositories.
   */
  CommitAction.prototype.setGitAccess = function (gitAccess) {
    this.gitAccess_ = gitAccess;
    if (gitAccess() instanceof syncGit.SyncGithubApi) {
      this.github = gitAccess().getGithub();
      this.repo = gitAccess().getGithubRepo_(fileLocation.repositoryUri);
    }
  };

  /**
   * Sets the toolbarButton
   * @param {Element} toolbarButton The github toolbar button
   */
  CommitAction.prototype.setGithubToolbarButton = function (toolbarButton) {
    this.githubToolbarButton = toolbarButton;
  };

  /** @override */
  CommitAction.prototype.renderLargeIcon = function() {
    var commitActionIcon = goog.dom.createDom('div', 'github-icon-octocat-large');

    if (sync.options.PluginsOptions.getClientOption('github.client_id')) {
      commitActionIcon.style.backgroundImage =
        'url("' + sync.util.computeHdpiIcon('../plugin-resources/github-static/LogoToolbar.png') + '")';
    } else {
      commitActionIcon.style.backgroundImage =
        'url("' + sync.util.computeHdpiIcon('../plugin-resources/github-static/Git-logo-white24.png') + '")';
    }

    this.iconWrapper = goog.dom.createDom('div', 'github-icon-wrapper', commitActionIcon);
    return this.iconWrapper;
  };

  /** @override */
  CommitAction.prototype.renderSmallIcon = function() {
    var commitActionIcon = goog.dom.createDom('div', 'github-icon-octocat-small');

    if (sync.options.PluginsOptions.getClientOption('github.client_id')) {
      commitActionIcon.style.backgroundImage =
        'url("' + sync.util.computeHdpiIcon('../plugin-resources/github-static/CommitToolbar.png') + '")';
    } else {
      commitActionIcon.style.backgroundImage =
        'url("' + sync.util.computeHdpiIcon('../plugin-resources/github-static/Git-logo24.png') + '")';
    }

    this.iconWrapper = goog.dom.createDom('div', 'github-icon-wrapper', commitActionIcon);
    return this.iconWrapper;
  };


  /** @override */
  CommitAction.prototype.getDisplayName = function() {
    return tr(msgs.GIT_COMMIT_);
  };

  /** @override */
  CommitAction.prototype.getDescription = function() {
    return tr(msgs.GIT_COMMIT_ON_REPOSITORY_);
  };

  /**
   * Shows the dialog.
   */
  CommitAction.prototype.showDialog = function() {
    this.dialog.show();
  };


  /**
   * Constructs and returns the dialog.
   *
   * @return {sync.api.Dialog} The dialog used to collect commit info.
   */
  CommitAction.prototype.getDialog = function() {
    if (!this.dialog) {
      this.dialog = workspace.createDialog();
      this.dialog.setPreferredSize(500, 310);
      this.dialog.setButtonConfiguration([
          {key: 'ok', caption: tr(msgs.GIT_COMMIT_)},
          {key: 'cancel', caption: tr(msgs.CANCEL_)}]);
    }

    // Update the innerHTML every time because it depends on this.branch which might change
    this.dialog.setTitle(tr(msgs.COMMIT_ON_GIT_));

    var dialogHtml = '<div class="github-commit-dialog">';
    dialogHtml +=
        '<div class="gh-commit-message-details">' +
          '<label>' + tr(msgs.COMMIT_MESSAGE_) + ': <textarea placeholder="' + CommitAction.DEFAULT_COMMIT_MESSAGE + '" class="github-input" name="message" autofocus="autofocus"></textarea></label>' +
          '<select class="commit-history"></select>' +
        '</div>';
    dialogHtml += '<div><label>' + tr(msgs.COMMIT_ON_BRANCH_) + ':<div class="branches-list github-commit-combo-list"></div></label></div>';

    var checked = localStorage.getItem('github.shortcut');
    if (checked && checked == 'true' || !checked) {
      checked = 'checked';
    } else {
      checked = '';
    }
    var hotKey = goog.userAgent.MAC || goog.userAgent.IPAD || goog.userAgent.IPHONE ? "&#8984;" : "Ctrl";

    dialogHtml +=
          '<label class="github-commit-shortcut">' +
            '<input id="gh-commit-sh-check" tabIndex="-1" type="checkbox" ' + checked + '/>' +
            tr(msgs.GIT_OPEN_DIALOG_WITH_SHORTCUT_, {'$SHORTCUT': hotKey + '+S'}) +
          '</label>';

    dialogHtml += '</div>';

    var el = this.dialog.getElement();
    el.innerHTML = dialogHtml;

    var container = this.dialog.getElement().querySelector('.branches-list');
    var branchEditableCombo = new sync.view.EditableCombo([{title: this.branch, value: this.branch}]);
    branchEditableCombo.render(container);
    branchEditableCombo.setValue(this.branch);

    if (this.branchesList) {
      this.branchesList.forEach(goog.bind(branchEditableCombo.appendItem, branchEditableCombo));
    } else {
      this.gitAccess_().getBranches(this.fileLocation_.repositoryUri, goog.bind(function (err, branches) {
        if (!err && this.dialog && this.dialog.isVisible()) {
          branches = branches.map(function (branch) {
            return {value: branch, title: branch};
          });

          if (!this.branchesList) {
            this.branchesList = [];
          }
          this.branchesList = this.branchesList.concat(branches);
          branches.forEach(goog.bind(branchEditableCombo.appendItem, branchEditableCombo));
        } else if (err && err.status === 401) {
          loginManager.setErrorMessage(err.message);
          loginManager.authenticateUser(goog.bind(function (gitAccess) {
            this.gitAccess_ = gitAccess;
          }, this), true);
        }
      }, this));
    }

    var shortcutCheckbox = this.dialog.getElement().querySelector('#gh-commit-sh-check');
    goog.events.listen(shortcutCheckbox, goog.events.EventType.CLICK, goog.bind(function (event) {
      // Update the shortcut
      setCommitActionShortcut(this.editor, event.target.checked ? CommitAction.SHORTCUT : null);

      // Save the change in localstorage to make it persistent
      try {
        localStorage.setItem('github.shortcut', event.target.checked);
      } catch (e) {}
    }, this));

    var ctrlEnterCommitKey = goog.events.listen(this.dialog.getElement().querySelector('textarea[name=message]'), goog.events.EventType.KEYUP,
        goog.bind(function (e) {
          if (e.keyCode === goog.events.KeyCodes.ENTER && e.ctrlKey) {
            goog.events.unlistenByKey(ctrlEnterCommitKey);
            e.stopPropagation();
            this.dialog.dispatchEvent(new goog.ui.Dialog.Event('ok', tr(msgs.OK_)));
            this.dialog.hide();
          }
        }, this));

    this.setupCommitHistory_();

    return this.dialog;
  };

  /**
   * Adds a commit history select element to the commit dialog.
   * @private
   */
  CommitAction.prototype.setupCommitHistory_ = function () {
    var commitHistory = localStorage.getItem('github.commit.history');
    commitHistory = commitHistory ? JSON.parse(commitHistory) : null;

    var commitHistoryElement = this.dialog.getElement().querySelector('.commit-history');
    if (commitHistory && commitHistory.length > 0) {
      commitHistoryElement.style.display = 'initial';
      commitHistoryElement.innerHTML = '';

      // Adding an id to the first option to make sure it's displayed as the first
      // selected element even if it has display: none
      commitHistoryElement.add(goog.dom.createDom(
          'option', {'id': 'commit-history-msg'},
          tr(msgs.CHOOSE_PREVIOUSLY_ENTERED_COMMENT_)));
      for (var i = 0; i < commitHistory.length; i++) {
        // The value of option must be a string otherwise an exception is thrown
        commitHistoryElement.add(goog.dom.createDom('option', null, "" + commitHistory[i]));
      }

      goog.events.listen(commitHistoryElement, goog.events.EventType.CHANGE, goog.bind(function (e) {
        if (commitHistoryElement.selectedIndex !== 0) {
          this.dialog.getElement().querySelector('textarea[name=message]').value =
              commitHistoryElement.options[commitHistoryElement.selectedIndex].text;
        }
      }, this));
    } else {
      commitHistoryElement.style.display = 'none';
    }
  };

  /**
   * Creates a branch on the <em>destination</em> repository from a <em>source</em> repository.
   * If the destination branch already exists, creates a new branch by icrementing the last number from the branch name.
   *
   * @param {Github.Repository} sourceRepo The repository from which to create the branch.
   * @param {string} sourceBranch The source branch name.
   * @param {Github.Repository} destinationRepo The repository into which to create the new branch.
   *        The destination branch sould have a name ending with -number (  /(.+-)(\d+)$/  )
   * @param {string} destinationBranch The destination branch name.
   * @param {function} cb The callback method to call after branching has completed.
   *
   * @private
   */
  CommitAction.prototype.branchFromRepoToRepo_ = function (sourceRepo, sourceBranch,
                                                           destinationRepo, destinationBranch, cb) {

    sourceRepo.getRef('heads/' + encodeURIComponent(sourceBranch), function (err, ref) {
      if (err) {
        return cb(err);
      }

      destinationRepo.createRef({
        sha: ref,
        ref: 'refs/heads/' + destinationBranch
      }, function created (err, result) {
        // The branch already exists, create a new one by incrementing the \d+ at the end.
        if (err && err.error === 422) {
          var match = destinationBranch.match(/(.+-)(\d+)$/);

          if (match == null) {
            console.log('Invalid destination branch given to branchFromRepoToRepo_');
            return cb(err); // This should never happen.
          }

          var rest = match[1];
          var number = parseInt(match[2]) + 1; // The branch already exists so try with a new, incremented, one.

          destinationBranch = rest + number;

          destinationRepo.createRef({
            sha: ref,
            ref: 'refs/heads/' + destinationBranch
          }, created);
          return;
        }

        cb(err, destinationBranch, result);
      });

      // cb(err, ref)
      // ref: {object: {sha, type, url}, ref, url}
    });
  };

  /**
   * Tries to commit if all the details needed for a commit were gathered.
   *
   * @param {object} ctx The context of this commit.
   * @param {function(object,object=)} cb Called after the commit was attempted with the
   * error and/or success values.
   */
  CommitAction.prototype.tryCommit = function(ctx, cb) {
    var self = this;
    if (ctx.branchExists && ctx.hasOwnProperty('content')) {
      this.getLatestFileVersion(ctx.branch, self.repo, function (err, latestFile) {
        // If this is a new branch or the document branch
        if (!ctx.branchAlreadyExists) {
          if (err) {
            return cb(err);
          }

          if (latestFile.sha === documentSha) {
            self.repo.commitToHead(ctx.branch, self.filePath, ctx.content, ctx.message, function(err, commit) {
              if (err) {
                return cb(err);
              }

              // Have committed, we save the document sha and head for the next commits
              // The document is now on the committed branch
              documentSha = commit.blobSha;
              documentCommit = commit.sha;
              initialDocument = ctx.content;

              self.branch = ctx.branch;

              // #safe#
              Github.apiRequest('GET', commit.head.url, null, function (err, response) {
                if (err) {
                  // If there was an error with getting the headUrl we wont propagate it further
                  // because the commit succeeded. And we just won't have a url to the successful commit
                  return cb();
                }
                cb(null, {
                  branch: self.branch,
                  headUrl: response.html_url
                });
              });
            });
          } else {
            self.startMergingCommit_(self.repo, ctx, latestFile.content, cb);
          }
        } else {
          // If the file doesn't exist on the different branch we can just create it without merging anything
          if (err === "not found") {
            self.repo.createFile(self.ctx.branch, self.filePath, self.ctx.content, self.ctx.message, function (err, result) {
              if (err) {
                return cb(err);
              }
              // Have committed, we save the document sha and head for the next commits
              // The document is now on the committed branch
              documentSha = result.content.sha;
              documentCommit = result.commit.sha;
              initialDocument = ctx.content;

              self.branch = ctx.branch;
              cb(null, {
                branch: self.branch,
                headUrl: result.commit.html_url
              });
            });
          } else if (err) {
            cb(err);
          } else {
            // Committing on a different branch is an action which the user has to confirm
            // Getting the head so we can show the user a diff, so he can make an informed decision
            self.startMergingCommit_(self.repo, ctx, latestFile.content, cb, true);
          }
        }
      });
    }
  };

  /**
   * Starts a commit, which merges with the latest content before it starts, defined by the given context
   * @param {Github.Repository} repo The repo to commit on
   * @param {{branch: string, message: string, content: string}} ctx The commit context
   * @param {string} latestContent The latest contents of the opened file taken from github
   * @param {function} cb The method to call on result
   * @param {boolean} differentBranch If true it means this commit is done on a branch different from the current
   * open documents branch.
   * @private
   */
  CommitAction.prototype.startMergingCommit_ = function (repo, ctx, latestContent, cb, differentBranch) {
    var self = this;

    var mergingComponents = {
      ancestor: initialDocument, // The current document in the state it was when we initially opened it
      left: ctx.content, // Left is the current document with our changes
      right: latestContent // Right is the latest version of the document from GitHub
    };

    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
      if (xhr.readyState == 4 && xhr.status == 200) {
        // 200 - Auto-merge completed
        var mergedFile = this.responseText;
        var resultType = this.getResponseHeader('OXY-Merge-Result');

        if (resultType === 'CLEAN' || resultType === 'IDENTICAL') {
          repo.createCommit(ctx.branch, self.filePath, mergedFile, ctx.message,
            goog.bind(self.onCommitCreated_, self, repo, differentBranch, resultType, cb));
        } else {
          repo.createCommit(ctx.branch, self.filePath, ctx.content, ctx.message, function (err, commit) {
            if (err) {return cb(err);}

            repo.compare(commit.head.sha, commit.sha, function (err, diff) {
              if (err) {return cb(err);}
              cb({
                error: 409,
                message: tr(msgs.FILE_EDITED_SINCE_OPENED_),
                diff: diff,
                commit: commit,
                autoMergeResult: {
                  resultType: resultType,
                  differentBranch: differentBranch
                }
              });
            });
          });
        }
      } else if (xhr.readyState == 4 && xhr.status >= 100) {
        // If the merge failed, just commit without auto-merging and have the user choose what to do to solve the conflicts
        repo.createCommit(ctx.branch, self.filePath, ctx.content, ctx.message, function (err, commit) {
          if (err) {return cb(err);}

          repo.compare(commit.head.sha, commit.sha, function (err, diff) {
            if (err) {return cb(err);}
            cb({
              error: 409,
              message: tr(msgs.FILE_EDITED_SINCE_OPENED_),
              diff: diff,
              commit: commit,
              autoMergeResult: {
                differentBranch: differentBranch
              }
            });
          });
        });
      }
    };
    xhr.open('POST', '../plugins-dispatcher/github-oauth/github/github_commit_merge');
    xhr.send(JSON.stringify(mergingComponents));
  };

  /**
   * Called when a file commit is created.
   *
   * @param {Github.Repository} repo The repo to compare on.
   * @param {boolean} differentBranch If true it means this commit is done on a branch different from the current
   *                  open documents branch.
   * @param {string} resultType The way the merging completed.
   * @param {function} cb The method to call on result
   * @param {object} err The error object.
   * @param {object} commit The created commit.
   * @private
   */
  CommitAction.prototype.onCommitCreated_ = function (repo, differentBranch, resultType, cb, err, commit) {
    if (err) {return cb(err);}

    repo.compare(documentCommit, commit.sha, function (err, diff) {
      if (err) {return cb(err);}
      cb({
        error: 409,
        message: tr(msgs.FILE_EDITED_SINCE_OPENED_),
        diff: diff,
        commit: commit,
        autoMergeResult: {
          resultType: resultType,
          differentBranch: differentBranch
        }
      });
    });
  };

  /**
   * Finalizes a commit (updates the document to the new head of the given commit)
   * @param {Github.Repository} repo The repository on which this commit was pushed
   * @param {string} branch The branch this commit was on
   * @param {string} committedContent The commit file string.
   * @param {object} err The commit error
   * @param {{sha: string, head: object, branch: string}} commitResult The commitResult
   * @private
   */
  CommitAction.prototype.finalizeCommit_ = function (repo, branch, committedContent, err, commitResult) {
    var self = this;
    if (!err) {
      // Have committed, we save the document sha and head for the next commits
      // The document is now on the commited branch
      documentSha = commitResult.blobSha;
      documentCommit = commitResult.sha;
      initialDocument = committedContent;

      this.branch = branch;
      this.repo = repo;

      // #safe# This callback will only be called when JGit commit is off.
      Github.apiRequest('GET', commitResult.head.url, null, function (err, response) {
        var msg;
        if (err) {
          msg = tr(msgs.COMMIT_SUCCESSFUL_ON_BRANCH_, {'$BRANCH_NAME': goog.string.htmlEscape(branch)});
        } else {
          msg = tr(msgs.COMMIT_SUCCESSFUL_ON_BRANCH_,
              {'$BRANCH_NAME': '<a target="_blank" href="' + response.html_url + '">' + goog.string.htmlEscape(branch) + '</a>'});
        }
        self.setStatus('success');
        errorReporter.showError(COMMIT_STATUS_TITLE, msg, sync.api.Dialog.ButtonConfiguration.OK);

        goog.events.listenOnce(errorReporter.errDialog.dialog, goog.ui.Dialog.EventType.SELECT,
          goog.bind(self.handleReloadOnNewBranch, self, true, null, null));
      });
    } else {
      this.setStatus('none');
      errorReporter.showError(COMMIT_STATUS_TITLE, tr(msgs.COMMIT_FAILED_), sync.api.Dialog.ButtonConfiguration.OK);
    }
  };

  /**
   * Finalizes a commit (updates the document to the new head of the given commit)
   * And maybe do a pull request.
   *
   * @param {object} commit The commit to finalize.
   * @param {string} branchName The name of the branch on which the commit was done.
   * @param {Github.Repository} repo The repository on which the commit was done.
   * @param {Github.Repository} repoToPullInto The repository to pull into in case of a pull request.
   * @param {object} pullRequestInfo Information about the pull request.
   * @private
   */
  CommitAction.prototype.finalizeCommitOnFork_ = function (commit, branchName,
                                                           repo, repoToPullInto, pullRequestInfo) {
    var self = this;

    // Have committed, we save the document sha and head for the next commits
    // The document is now on the commited branch
    documentSha = commit.blobSha;
    documentCommit = commit.sha;
    initialDocument = self.ctx.content;

    self.previousBranch = self.branch;

    self.branch = branchName;
    self.repo = repo;

    // #safe# This callback will only be called when JGit commit is off.
    Github.apiRequest('GET', commit.head.url, null, function (err, response) {
      var msg;

      if (pullRequestInfo.doPullRequest) {
        var commitHeadUrl = null;
        if (!err) {
          commitHeadUrl = response.html_url;
        }
        self.openPullRequest_(repo, repoToPullInto, branchName, pullRequestInfo, commitHeadUrl);
        return;
      }

      if (err) {
        msg = tr(msgs.COMMIT_SUCCESSFUL_ON_BRANCH_, {'$BRANCH_NAME': goog.string.htmlEscape(self.ctx.branch)});
      } else {
        msg = tr(
            msgs.COMMIT_SUCCESSFUL_ON_BRANCH_,
            {'$BRANCH_NAME': '<a target="_blank" href="' + response.html_url + '">' + goog.string.htmlEscape(branchName) + '</a>'});
      }
      self.setStatus('success');
      errorReporter.showError(COMMIT_STATUS_TITLE, msg, sync.api.Dialog.ButtonConfiguration.OK);

      goog.events.listenOnce(errorReporter.errDialog.dialog, goog.ui.Dialog.EventType.SELECT,
        goog.bind(self.handleReloadOnNewBranch, self, true, branchName, null));
    });
  };

  /**
   * Gets the latest version for the current file
   * @param {string} branch The branch on which we'll make the request
   * @param {Github.Repository} repo The repository on which to check
   * @param {function} cb The method to call on result
   * @private
   */
  CommitAction.prototype.getLatestFileVersion = function (branch, repo, cb) {
    repo.getContents(branch, this.filePath, function (err, file) {
      if (err) {return cb(err);}

      cb(null, {
        sha: file.sha,
        content: sync.util.decodeB64(file.content)
      })
    });
  };

  /**
   * Perform the actual commit.
   *
   * @param {function(object,object=)} cb Callback after the commit is performed.
   * @param {object} ctx The context of the commit.
   */
  CommitAction.prototype.performCommit = function(ctx, cb) {
    var self = this;
    this.setStatus('loading');

    // Obtain the content of the current file.
    this.getContent(goog.bind(function(err, content) {
      ctx.content = content;
      this.tryCommit(ctx, cb);
    }, this));

    // Create the branch if it does not exist.
    if (ctx.branch && ctx.branch !== this.branch) {
      ctx.branchExists = false;
      this.createBranch_(self.repo, ctx, function (err) {
        if (!err) {
          self.branch = ctx.branch;
          ctx.branchExists = true;
          self.tryCommit(ctx, cb);
        } else{
          ctx.branchExists = false;
          cb(err);
        }
      });
    } else {
      ctx.branchExists = true;
    }
  };

  /**
   * Gathers the parameters which are necessary to perform a commit.
   * @param {string} destinationBranch The branch on which the user wants to commit.
   * @param {string} commitMessage The message which will be used for the commit.
   * @param {function} callback The method to call after all commit parameters have been gathered.
   * @private
   */
  CommitAction.prototype.gatherCommitParameters_ = function (destinationBranch, commitMessage, callback) {
    var self = this;
    this.getContent(function (err, content) {
      if (err) {
        self.setStatus('none');
        errorReporter.showError(COMMIT_STATUS_TITLE,
          tr(msgs.FAILED_TO_RETRIEVE_DOCUMENT_CONTENT_),
          sync.api.Dialog.ButtonConfiguration.OK);
        return;
      }

      callback({
        repositoryUri: fileLocation.repositoryUri,
        sourceBranch: fileLocation.branch,
        filePath: fileLocation.filePath,
        destinationBranch: destinationBranch,
        newFileContent: content,
        commitMessage: commitMessage,
        committer: localStorage.getItem(GIT_USER_NAME_KEY),
        email: localStorage.getItem(GIT_EMAIL_KEY),
        initialSha: documentSha,
        initialContent: initialDocument,

        merged: false // flag telling whether a merge occurred during this commit.
      });
    });
  };

  /**
   * Perform the actual commit using JGit.
   *
   * @param {object} commitParameters The parameters needed to perform a commitusing JGit.
   * @param {function} callback The method to call once the commit has finished.
   * @private
   */
  CommitAction.prototype.performCommitJGit_ = function(commitParameters, callback) {
    var self = this;
    goog.net.XhrIo.send('../plugins-dispatcher/git/commit', function (e) {
      var xhr = /** {@type goog.net.XhrIo} */ (e.target);
      var responseStatus = xhr.getStatus();

      if (responseStatus === 200) {
        var status = xhr.getResponseHeader('OXY-C-STATUS');

        switch (status) {
        case 'ok':
          var responseBody = xhr.getResponseText().split(';;');

          var commitSha = responseBody[0];
          var fileSha = responseBody[1];
          callback(status, {
            commitSha: commitSha,
            fileSha: fileSha
          });
          break;
        case 'merge':
          var mergeResultType = xhr.getResponseHeader('OXY-M-RESULT');
          var latestSha = xhr.getResponseHeader('OXY-LATEST-SHA');
          var mergedString = xhr.getResponseText();
          callback(status, {
            mergeResultType: mergeResultType,
            mergedString: mergedString,
            latestSha: latestSha
          });
          break;
        default:
          var errorMessage = xhr.getResponseText();
          callback(status, {
            errorMessage: errorMessage
          });
          break;
        }
      } else if (responseStatus === 401) {
        loginManager.setErrorMessage(xhr.getResponseText());
        loginManager.authenticateUser(goog.bind(function (gitAccess) {
          self.gitAccess_ = gitAccess;

          // Try the commit again now that we are authenticated.
          self.performCommitJGit_(commitParameters, callback);
        }, this), true);
      } else {
        callback('connection-error', {
          errorMessage: tr(msgs.CONNECTION_ERROR_)
        });
      }
    }, 'POST', JSON.stringify(commitParameters));
  };

  /**
   * Writes a file to the repository without attempting to merge.
   * @param {object} writeParameters The paremeters needed for the write method.
   * @param {function} callback The method to call after the write has finished.
   * @private
   */
  CommitAction.prototype.performWriteJGit_ = function (writeParameters, callback) {
    var self = this;
    goog.net.XhrIo.send('../plugins-dispatcher/git/write', function (e) {
      var xhr = /** {@type goog.net.XhrIo} */ (e.target);
      var responseStatus = xhr.getStatus();

      if (responseStatus === 200) {
        var status = xhr.getResponseHeader('OXY-C-STATUS');

        switch (status) {
        case 'ok':
          var responseBody = xhr.getResponseText().split(';;');

          var commitSha = responseBody[0];
          var fileSha = responseBody[1];
          callback(status, {
            commitSha: commitSha,
            fileSha: fileSha
          });
          break;
        default:
          var errorMessage = xhr.getResponseText();
          callback(status, {
            errorMessage: errorMessage
          });
          break;
        }
      } else if (responseStatus === 401) {
        loginManager.setErrorMessage(xhr.getResponseText());
        loginManager.authenticateUser(function (gitAccess) {
          self.gitAccess_ = gitAccess;
          self.performWriteJGit_(writeParameters, callback);
        }, true);
      } else {
        callback('connection-error', {
          errorMessage: tr(msgs.CONNECTION_ERROR_)
        });
      }
    }, 'POST', JSON.stringify(writeParameters));
  };

  /**
   * Called to finalize a commit made with JGit.
   * @param {object} commitParameters The parameters used to make the commit.
   * @param {string} status The status of the commit.
   * @param {object} commitInfo Information about the finalized commit.
   * @private
   */
  CommitAction.prototype.commitJGitFinalized_ = function (commitParameters, status, commitInfo) {
    switch (status) {
    case 'ok':
      documentCommit = commitInfo.commitSha;
      documentSha = commitInfo.fileSha;
      initialDocument = commitParameters.newFileContent;

      this.gitAccess_().getUrlOfCommit(commitParameters.repositoryUri, documentCommit, goog.bind(function (commitHtmlUrl) {
        this.setStatus('success');

        var branch = commitHtmlUrl ?
            goog.dom.createDom('a', {'target': '_blank', 'href': commitHtmlUrl }, commitParameters.destinationBranch) :
            commitParameters.destinationBranch;

        var commitSuccessMessage = tr(msgs.COMMIT_SUCCESSFUL_ON_BRANCH_);
        var messages = commitSuccessMessage.split('{$BRANCH_NAME}');

        errorReporter.showError(
            COMMIT_STATUS_TITLE,
            goog.dom.createDom(
              'span', {'id': 'github-commit-success-indicator'},
              messages[0],
              branch,
              messages[1]
            ),
            sync.api.Dialog.ButtonConfiguration.OK
        );

        this.markEditorAsSaved(errorReporter);

        goog.events.listenOnce(errorReporter.errDialog.dialog, goog.ui.Dialog.EventType.SELECT,
          goog.bind(this.handleReloadOnNewBranch, this, commitParameters.merged,
            commitParameters.destinationBranch, commitParameters.repositoryUri));
      }, this));
      break;
    case 'merge':
      var availableActionsOnDialog = {overwrite: true, branch: true};
      if (commitInfo.mergeResultType === 'CLEAN') {
        availableActionsOnDialog.merge = true;
      }

      // The createMergeDialog_ method expects an error object.
      var err = {
        autoMergeResult: {
          differentBranch: commitParameters.sourceBranch != commitParameters.destinationBranch,
          resultType: commitInfo.mergeResultType
        },
        diff: {} // The diff will be empty, we can't show a diff when using JGit
      };         // (Maybe only show it for github repoUri's somehow)

      var dialogElement = this.createMergeDialog_(err, availableActionsOnDialog);

      this.setStatus('none');

      var choices = dialogElement.querySelectorAll('#gh-commit-diag-content > .gh-commit-diag-choice');
      for (var i = 0; i < choices.length; i++) {
        choices[i].addEventListener('click', goog.bind(this.handleCommitIsNotAFastForwardJGit_, this,
          commitParameters, commitInfo, choices[i].getAttribute('id')));
      }
      break;
    case 'no-access':
      if (this.gitAccess_().canFork()) {
        this.gatherForkDetails_(commitParameters);
      } else {
        this.setStatus('none');

        errorReporter.showError(COMMIT_STATUS_TITLE, tr(msgs.COMMIT_FAILED_) + ': ' + commitInfo.errorMessage, [
          {key: 'switch-user', caption: tr(msgs.LOGIN_WITH_DIFFERENT_USER_)},
          {key: 'no', caption: tr(msgs.CANCEL_)}
        ]);

        errorReporter.onSelect(function (key, e) {
          if (key === 'switch-user') {
            loginManager.switchUser(goog.bind(function (gitAccess) {
              this.gitAccess_ = gitAccess;
            }, this));
          }
        });
      }
      break;
    default:
      this.setStatus('none');
      errorReporter.showError(COMMIT_STATUS_TITLE, tr(msgs.COMMIT_FAILED_) + ': ' +
        commitInfo.errorMessage, sync.api.Dialog.ButtonConfiguration.OK);
      break;
    }
  };

  /**
   * Shows a dialog where the user is prompted for the name of the branch on which to commit when
   * there are conflicts and no merging is possible or the user does not want to merge.
   *
   * @param {object} commitParameters The parameters of the commit.
   * @private
   */
  CommitAction.prototype.gatherBranchingDetails_ = function (commitParameters) {
    var self = this;

    var chosenBranch = self.ctx.branch;
    var branchNameSuffix = self.getNewBranchSuffix_();

    self.checkIfBranchExists_(commitParameters.repositoryUri, chosenBranch + branchNameSuffix, function (err, result) {
      if (err) {
        self.setStatus('none');
        errorReporter.showError(COMMIT_STATUS_TITLE, tr(msgs.COULD_NOT_CREATE_NEW_BRANCH_),
          sync.api.Dialog.ButtonConfiguration.OK);
      } else {
        var availableBranch = result.availableName;

        chosenBranch = availableBranch.substring(0, chosenBranch.length);
        branchNameSuffix = availableBranch.substring(chosenBranch.length);

        var msg =
          '<div class="gh_pull_diag">' +
            '<div class="gh-commit-info-prolog">' +
              '<div class="gh-fork-info">' +
                tr(msgs.BRANCH_) + ': ' +
                '<span id="gh-fork-branch-name" contenteditable="true">' + chosenBranch + '</span>' +
                '<span class="gh-branch-name-suffix">' + branchNameSuffix + '</span>' +
              '</div>' +
            '</div>' +
          '</div>';

        self.setStatus('none');
        errorReporter.showError(COMMIT_STATUS_TITLE, msg, [
            {key: 'yes', caption: tr(msgs.COMMIT_ON_NEW_BRANCH_)},
            {key: 'no',  caption: tr(msgs.CANCEL_)}]);

        errorReporter.errDialog.dialog.listenOnce(goog.ui.Dialog.EventType.SELECT, function (e) {
          if (e.key === 'yes') {
            var dialogElement = errorReporter.errDialog.getElement();

            var finalBranchName = dialogElement.querySelector('span#gh-fork-branch-name').textContent;
            if (!finalBranchName) {
              finalBranchName = chosenBranch;
            }

            commitParameters.destinationBranch = finalBranchName + branchNameSuffix;

            if (!(self.gitAccess_() instanceof syncGit.SyncGithubApi)) {
              self.setStatus('loading');

              self.performWriteJGit_(commitParameters, goog.bind(
                self.finalizeFork_, self, commitParameters, {
                  forkedRepositoryUri: commitParameters.repositoryUri,
                  sourceRepositoryUri: commitParameters.repositoryUri,
                  destinationBranch: commitParameters.destinationBranch,
                  sourceBranch: commitParameters.sourceBranch
                }, false, null, null));
            } else {
              self.setStatus('loading');
              var ownerAndRepo = commitParameters.repositoryUri.match(/([^/]+)\/([^/]+)\/?$/);
              var owner = ownerAndRepo[1];
              var repo = ownerAndRepo[2];

              // #safe#
              var githubRepo = self.github.getRepo(owner, repo);

              self.ctx.branch = commitParameters.destinationBranch;

              self.createBranch_(githubRepo, self.ctx, function (err) {
                if (!err) {
                  self.commitToForkedRepo_(githubRepo, commitParameters.destinationBranch, {
                    pullTitle: null,
                    pullMessage: null,
                    doPullRequest: false
                  });
                } else {
                  self.setStatus('none');
                  errorReporter.showError(COMMIT_STATUS_TITLE, tr(msgs.COULD_NOT_CREATE_NEW_BRANCH_),
                    sync.api.Dialog.ButtonConfiguration.OK);
                }
              });
            }
          }
        });
      }
    });
  };

  /**
   * Shows a dialog where the user is prompted for information about how to fork a repository.
   *
   * @param {object=} commitParameters Parameters of the commit which will be
   * continued on the forked repository.
   *
   * @private
   */
  CommitAction.prototype.gatherForkDetails_ = function (commitParameters) {
    var self = this;

    if (!commitParameters) {
      commitParameters = self.commitParameters;
    }

    var chosenBranch = self.ctx.branch;
    var branchNameSuffix = self.getNewBranchSuffix_();

    self.checkIfBranchExists_(commitParameters.repositoryUri, chosenBranch + branchNameSuffix, function (err, result) {
      if (err) {
        errorReporter.showError(COMMIT_STATUS_TITLE, tr(msgs.FAILED_TO_FORK_REPOSITORY_), sync.api.Dialog.ButtonConfiguration.OK);
      } else {
        var availableBranch = result.availableName;

        chosenBranch = availableBranch.substring(0, chosenBranch.length);
        branchNameSuffix = availableBranch.substring(chosenBranch.length);

        var msg =
          '<div class="gh_pull_diag">' +
            '<div class="gh-commit-info-prolog">' +
              tr(msgs.COMMIT_NO_WRITE_ACCESS_) +
              '<div class="gh-fork-info">' +
                tr(msgs.BRANCH_) + ': ' +
                '<span id="gh-fork-branch-name" contenteditable="true">' + chosenBranch + '</span>' +
                '<span class="gh-branch-name-suffix">' + branchNameSuffix + '</span>' +
              '</div>' +
            '</div>' +
            '<input type="checkbox" id="gh-pullRequest" name="pullRequest" value="pullRequest" checked />' +
            '<label for="gh-pullRequest">' + tr(msgs.CREATE_PULL_REQUEST_AUTOMATICALLY_) + '</label>' +
            '<div class="gh-pull-info">' +
              '<label>' +
                tr(msgs.PULL_REQUEST_TITLE_) + ': ' +
                '<input name="pullTitle" placeholder="' + CommitAction.DEFAULT_PULL_TITLE + '" type="text" />' +
              '</label>' +
              '<label>' +
                tr(msgs.MESSAGE_) + ': ' +
                '<input name="pullMessage" placeholder="' + CommitAction.DEFAULT_COMMIT_MESSAGE + '" value="' +
                self.ctx.message + '"/>' +
              '</label>' +
            '</div>' +
          '</div>';

        self.setStatus('none');
        errorReporter.showError(COMMIT_STATUS_TITLE, msg, [
            {key: 'yes', caption: tr(msgs.GIT_COMMIT_)},
            {key: 'no',  caption: tr(msgs.CANCEL_)}]);

        errorReporter.errDialog.dialog.listenOnce(goog.ui.Dialog.EventType.SELECT, function (e) {
          if (e.key === 'yes') {
            var dialogElement = errorReporter.errDialog.getElement();
            var doPullRequest = dialogElement.querySelector('input[name=pullRequest]').checked;

            var pullTitle = dialogElement.querySelector('input[name=pullTitle]').value;
            var pullMessage = dialogElement.querySelector('input[name=pullMessage]').value;

            var finalBranchName = dialogElement.querySelector('span#gh-fork-branch-name').textContent;
            if (!finalBranchName) {
              finalBranchName = chosenBranch;
            }

            self.doFork(e, finalBranchName + branchNameSuffix, function (err, result) {
              var message = tr(msgs.COULD_NOT_COMMIT_ON_FORK_REPO_);
              if (err) {
                self.setStatus('none');
                errorReporter.showError(COMMIT_STATUS_TITLE, message, sync.api.Dialog.ButtonConfiguration.OK);
              } else {
                // Going to retry the commit but this time on the fork.
                commitParameters.repositoryUri = result.forkedRepositoryUri;
                commitParameters.destinationBranch = result.destinationBranch;

                if (!(self.gitAccess_() instanceof syncGit.SyncGithubApi)) {
                  self.performCommitJGit_(commitParameters, goog.bind(
                    self.finalizeFork_, self, commitParameters, result, doPullRequest,
                    pullTitle, pullMessage));
                } else {
                  var ownerAndRepo = commitParameters.repositoryUri.match(/([^/]+)\/([^/]+)\/?$/);
                  var owner = ownerAndRepo[1];
                  var repo = ownerAndRepo[2];

                  // #safe#
                  var forkedRepo = self.github.getRepo(owner, repo);
                  self.commitToForkedRepo_(forkedRepo, commitParameters.destinationBranch, {
                    pullTitle: pullTitle,
                    pullMessage: pullMessage,
                    doPullRequest: doPullRequest
                  });
                }
              }
            });
          }
        });
      }
    });
  };

  /**
   * Finishes a fork flow. Shows a dialog telling the user how everything went.
   *
   * @param {object} commitParameters The parameters used to make the commit.
   * @param {object} forkResult The result of the fork.
   *
   * @param {string} forkResult.sourceBranch The branch from which the fork was created
   * @param {string} forkResult.sourceRepositoryUri The repository from which the fork was created.
   * @param {string} forkResult.destinationBranch The destination branch of the fork.
   * @param {string} forkResult.forkedRepositoryUri The destination repository of the fork.
   *
   * @param {boolean} doPull If <code>true</code> then a pull request will be created.
   * @param {string} pullTitle The title of the pull request.
   * @param {string} pullMessage The message of the pull request.
   *
   * @param {string} status The status of the commit.
   * @param {object} commitInfo Information about the finalized commit.
   * (Check performCommitJGit_ for commitInfo structure)
   *
   * @private
   */
  CommitAction.prototype.finalizeFork_ = function (commitParameters,
                                                   forkResult,
                                                   doPull,
                                                   pullTitle,
                                                   pullMessage,
                                                   status,
                                                   commitInfo) {
    var self = this;

    var sourceRepositoryUri = forkResult.forkedRepositoryUri;
    var destinationRepositoryUri = forkResult.sourceRepositoryUri;
    var sourceBranch = forkResult.destinationBranch;
    var destinationBranch = forkResult.sourceBranch;

    switch (status) {
    case 'ok':
      if (doPull) {
        this.gitAccess_()
          .openPullRequest(sourceRepositoryUri, destinationRepositoryUri,
                           sourceBranch, destinationBranch, pullMessage, pullTitle,
                           function (err, pullRequestUrl) {
                             if (err) {
                               self.gitAccess_().getUrlOfCommit(sourceRepositoryUri, commitInfo.commitSha, function (commitHtmlUrl) {
                                 self.setStatus('none');

                                 documentCommit = commitInfo.commitSha;
                                 documentSha = commitInfo.fileSha;
                                 initialDocument = commitParameters.newFileContent;

                                 var branch = (commitHtmlUrl ?
                                 '<a target="_blank" href="' + commitHtmlUrl + '">' + sourceBranch + '</a> ' : branch);
                                 errorReporter.showError(COMMIT_STATUS_TITLE,
                                   tr(msgs.COMMIT_SUCCESSFUL_PULL_FAILED_, {'$BRANCH_NAME': branch}),
                                   sync.api.Dialog.ButtonConfiguration.OK);

                                 listenForReloadOnNewBranch();
                               });
                             } else {
                               self.setStatus('none');

                               var pullRequest = (pullRequestUrl ?
                                '<a target="_blank" href="' + pullRequestUrl + '">' + tr(msgs.PULL_REQUEST_) + '</a>' :
                                tr(msgs.PULL_REQUEST_));
                               errorReporter.showError(COMMIT_STATUS_TITLE,
                                   tr(msgs.PULL_REQUEST_SUCCESSFUL_, {'$PULL_REQUEST': pullRequest}),
                                   sync.api.Dialog.ButtonConfiguration.OK);

                               documentCommit = commitInfo.commitSha;
                               documentSha = commitInfo.fileSha;
                               initialDocument = commitParameters.newFileContent;

                               listenForReloadOnNewBranch();
                             }
                           });
      } else {
        this.gitAccess_().getUrlOfCommit(sourceRepositoryUri, commitInfo.commitSha, function (commitHtmlUrl) {
          self.setStatus('none');

          var branch = (commitHtmlUrl ?
            '<a target="_blank" href="' + commitHtmlUrl + '">' + sourceBranch + '</a>' :
            sourceBranch);
          errorReporter.showError(COMMIT_STATUS_TITLE,
            tr(msgs.COMMIT_SUCCESSFUL_ON_BRANCH_, {'$BRANCH_NAME': branch}),
            sync.api.Dialog.ButtonConfiguration.OK);

          documentCommit = commitInfo.commitSha;
          documentSha = commitInfo.fileSha;
          initialDocument = commitParameters.newFileContent;

          listenForReloadOnNewBranch();
        });
      }
      break;
    default:
      this.setStatus('none');
      errorReporter.showError(COMMIT_STATUS_TITLE, tr(msgs.COMMIT_FAILED_) + ': ' +
        commitInfo.errorMessage, sync.api.Dialog.ButtonConfiguration.OK);
      break;
      break;
    }

    function listenForReloadOnNewBranch() {
      goog.events.listenOnce(errorReporter.errDialog.dialog, goog.ui.Dialog.EventType.SELECT,
        goog.bind(self.handleReloadOnNewBranch, self, commitParameters.merged,
          commitParameters.destinationBranch, commitParameters.repositoryUri));
    }
  };

  /**
   * Checks if a branch exists on a given repository.
   *
   * @param {string} repositoryUri The URI of the repository to check.
   * @param {string} branch The name of the branch to check.
   * @param {function} cb The method to call when the result is received.
   *
   * @private
   */
  CommitAction.prototype.checkIfBranchExists_ = function (repositoryUri, branch, cb) {
    goog.net.XhrIo.send('../plugins-dispatcher/git/branch-exists', function (e) {
      var xhr = /** {@type goog.net.XhrIo} */ (e.target);

      if (xhr.getStatus() === 200) {
        var status = xhr.getResponseHeader('OXY-C-STATUS');
        switch (status) {
        case 'success':
          var result = xhr.getResponseText();
          result = JSON.parse(result);

          cb(null, {
            branchExists: result.branchExists,
            availableName: result.nextAvailable
          });
          break;
        case 'error':
          cb({
            status: 500,
            message: xhr.getResponseText()
          });
          break;
        }
      } else {
        cb({
          status: 500,
          message: tr(msgs.CONNECTION_ERROR_)
        });
      }
    }, 'POST', JSON.stringify({
      repositoryUri: repositoryUri,
      branch: branch
    }));
  };

  /**
   * Creates a new branch
   * @param {Github.Repository} repo The repository on which to create a new branch
   * @param {object} ctx The context of the commit
   * @param {function(object)} cb The method to call on result
   * @private
   */
  CommitAction.prototype.createBranch_ = function (repo, ctx, cb) {
    repo.branch(this.branch, ctx.branch, goog.bind(function(err) {
      err = this.getBranchingError_(err, ctx);
      if (err && err.error === 404) {
        // Maybe this was a commit ref instead of a branch ref. Let's try.
        repo.createRef({
          "ref": "refs/heads/" + ctx.branch,
          "sha": this.branch
        }, goog.bind(function(err) {
          err = this.getBranchingError_(err, ctx);
          cb(err);
        }, this));
      } else {
        cb(err);
      }
    }, this));
  };

  /**
   * Function that returns the error object that occurred during branch creation.
   * @param {object<{err: number, request: object}>} err
   * @param {object} ctx The context of the commit
   * @returns {object} The error object or null
   * @private
   */
  CommitAction.prototype.getBranchingError_ = function(err, ctx) {
    if (err) {
      if (err.error == 422 && err.request.responseText.indexOf("Reference already exists") !== -1) {
        // The branch already exists, so we can commit on it.
        err = null;
        ctx.branchAlreadyExists = true;
      }
    }
    return err;
  };

  /**
   * Handles the dialog result.
   *
   * @param {function()} cb Callback after the commit is performed.
   * @param {string} key The result of the dialog.
   * @param {event} e The submit event.
   */
  CommitAction.prototype.detailsProvided = function(cb, key, e) {
    var ctx = null;
    if (key == 'ok') {
      var el = this.dialog.getElement();

      var userToNotify = sync.util.getURLParameter('gh-notify');
      var issueNumber = sync.util.getURLParameter('gh-issue');

      var commitMessage = el.querySelector('[name="message"]').value || CommitAction.DEFAULT_COMMIT_MESSAGE;
      this.addCommitMessageToHistory_(commitMessage);

      ctx = {
        message: (userToNotify ? '@' + userToNotify + ' ' : '') +  // Add @username annotation to let github notify
                                                                   // the user about this commit
                 (issueNumber ? '#' + issueNumber + ' ' : '') +    // Add #issueNumber annotation to let github notify
                                                                   // anyone who is watching the specified issue
                 commitMessage,
        branch: el.querySelector('.branches-list input').value
      };

      // A branch must be provided!
      if (!ctx.branch) {
        ctx.branch = this.branch;
      }

      // save ctx it for the fork and commit button
      this.ctx = ctx;

      if (this.gitAccess_() instanceof syncGit.SyncGithubApi) {
        this.gatherCommitParameters_(ctx.branch, ctx.message, goog.bind(function (commitParameters) {
          this.commitParameters = commitParameters;
          this.performCommit(ctx, cb);
        }, this));
      } else {
        this.setStatus('loading');
        this.gatherCommitParameters_(ctx.branch, ctx.message, goog.bind(function (commitParameters) {
          this.performCommitJGit_(commitParameters, goog.bind(this.commitJGitFinalized_, this, commitParameters));
        }, this));
      }
    }
  };

  /**
   * Checks whether a given name is a valid git branch name.
   *
   * @param {string} name The name to check for validity.
   * @return {boolean} <code>true</code> if the given name is a valid branch name, <code>false</code> otherwise.
   *
   * @private
   */
  CommitAction.prototype.isValidBranchName_ = function (name) {
    // Branch names should not start with .
    if (name.indexOf('.') == 0) {
      return false;
    }

    // Branch names should not end with .lock or /
    if (name.match(/^.*(\/|\.lock)$/)) {
      return false;
    }

    // Branch names should not ~ ^ : \ WHITE_SPACE
    if (name.match(/[~^:\s\\]/)) {
      return false;
    }

    // Branch names should not contains ..
    if (name.match(/.*\.\..*/)) {
      return false
    }

    return true;
  };

  /**
   * Adds the given commit message to localstorage for later use.
   * @param {string} commitMessage The commit message to add.
   * @private
   */
  CommitAction.prototype.addCommitMessageToHistory_ = function (commitMessage) {
    if (!commitMessage) {
      return;
    }
    var commitHistory = localStorage.getItem('github.commit.history');
    commitHistory = commitHistory ? JSON.parse(commitHistory) : [];

    var commitMessageIndex = commitHistory.indexOf(commitMessage);
    if (commitMessageIndex === -1) {
      commitHistory.unshift(commitMessage);
    } else {
      // If this message was used before we move it at the beginning of the array;
      commitHistory.splice(commitMessageIndex, 1);
      commitHistory.unshift(commitMessage);
    }
    if (commitHistory.length > 10) {
      commitHistory.pop();
    }

    try {
      localStorage.setItem('github.commit.history', JSON.stringify(commitHistory));
    } catch (e) {}
  };

  /**
   * Callback when the commit is finished, successfully or not.
   *
   * @param {function} cb The callback.
   * @param {object} err The error descriptor, if there was an error.
   * @param {{branch: string, headUrl: string}=} result An object containing the branch name on which the commit succeded
   *                      and a url to the commit on github.
   */
  CommitAction.prototype.commitFinalized = function(cb, err, result) {
    if (!err) {
      this.markEditorAsSaved(errorReporter);
      this.setStatus('success');

      if (result) {
        errorReporter.showError(COMMIT_STATUS_TITLE,
          '<span id="github-commit-success-indicator">' +
            tr(msgs.COMMIT_SUCCESSFUL_ON_BRANCH_,
              {'$BRANCH_NAME': '<a target="_blank" href="' + result.headUrl + '">' + result.branch + '</a>'}) +
          '</span>',
          sync.api.Dialog.ButtonConfiguration.OK);
      } else {
        errorReporter.showError(COMMIT_STATUS_TITLE, '<span id="github-commit-success-indicator">' +
            tr(msgs.COMMIT_SUCCESSFUL_) + '</span>',
          sync.api.Dialog.ButtonConfiguration.OK);
      }

      goog.events.listenOnce(errorReporter.errDialog.dialog, goog.ui.Dialog.EventType.SELECT,
        goog.bind(this.handleReloadOnNewBranch, this, false, null, null));
    } else {
      this.handleErrors(err);
    }
    cb();
  };

  /**
   * Marks the editor as saved both client-side and server-side.
   *
   * When it is done, it makes sure to focus the dialog passed as a parameter.
   * 
   * @param {GitHubErrorReporter} opt_errorReporter The error reporter used to show the commit status - it will be 
   * focused after the editor is marked as saved.
   */
  CommitAction.prototype.markEditorAsSaved = function(opt_errorReporter) {
    this.editor.setDirty(false);
    this.editor.getActionsManager().invokeOperation('WebappMarkAsSavedOperation', {}, opt_errorReporter ? function () {
      // When WebappMarkAsSavedOperation completes the focus is moved inside the document.
      setTimeout(function () {
        // We set it back to the error reporter dialog if it still is visible
        // because the error reporter dialog might listen for keydown events.
        if (opt_errorReporter.errDialog.isVisible()) {
          opt_errorReporter.errDialog.focus();
        }
      }, 50); // On edge the focus/selection is moved with a delay so wait a bit more before re-focusing the dialog.
    } : goog.nullFunction);
  };

  /**
   * Navigates to the url of this document on the new branch, created/updated by the latest commit
   *
   * @param {boolean} reloadEvenIfSameBranch If true the page will reload even if the branch did not change.
   * @param {string=} newBranchName The name of the branch on which to reload.
   * @param {string=} newRepositoryUri The URI of the repository on which to maybe reload.
   *
   * @param {event} e The triggering event
   */
  CommitAction.prototype.handleReloadOnNewBranch = function (reloadEvenIfSameBranch, newBranchName, newRepositoryUri, e) {
    var branch = fileLocation.branch;
    var currentRepositoryUri = fileLocation.repositoryUri;

    if (!newBranchName) {
      newBranchName = this.branch;
    }

    if (!newRepositoryUri) {
      newRepositoryUri = currentRepositoryUri;
    }

    if (newBranchName != branch || currentRepositoryUri != newRepositoryUri) {
      var currentUrl = decodeURIComponent(sync.util.getURLParameter('url'));

      var newUrl;
      if (currentUrl.indexOf('github://getFileContent') == 0 || currentUrl.match(/^https?:\/\/(?:www\.)?github.com/)) {
        newUrl = 'github://getFileList/' + encodeURIComponent(newRepositoryUri) + '/' +
          encodeURIComponent(newBranchName) + '/' + fileLocation.filePath;

        newUrl = fromListToContentUrl_(newUrl);
      } else if (currentUrl.indexOf('github://getFileList') == 0) {
        newUrl = 'github://getFileList/' + encodeURIComponent(newRepositoryUri) + '/' +
          encodeURIComponent(newBranchName) + '/' + fileLocation.filePath.split('/').map(encodeURIComponent).join('/');
      } else {
        console.log('Error: can\'t redirect to a new branch.');
        return;
      }

      var webappUrl = sync.util.serializeQueryString(newUrl, sync.util.getOpenLinkUrlParams());

      this.editor.setDirty(false);
      window.open(webappUrl, "_self");
    } else if (reloadEvenIfSameBranch) {
      this.editor.setDirty(false);
      window.location.reload();
    }
  };

  /**
   * Returns the sufix which we will append to new branches when creating them.
   * @returns {string} The generated branch suffix.
   * @private
   */
  CommitAction.prototype.getNewBranchSuffix_ = function () {
    var now = new Date();
    var month = now.getMonth() + 1; // Months are 0 based
    var day = now.getDate();
    var hour = now.getHours();
    var minute = now.getMinutes();
    var second = now.getSeconds();

    var branchNameSuffix = '.oXygen-Web-Author-' + month +
      '.' + day + '-' + hour + '.' + minute + '.' + second + '-0';

    return branchNameSuffix;
  };

  /**
   * Final destination for errors
   * @param {object} err The error to handle
   */
  CommitAction.prototype.handleErrors = function (err) {
    var self = this;
    this.setStatus('none');

    var msg = tr(msgs.COMMIT_FAILED_);

    if (err.error == 404) {
      // 404 here means there is no commit access, so try to fork.
      if (self.gitAccess_().canFork()) {
        this.setStatus('loading');
        self.gatherForkDetails_();
      } else {
        errorReporter.showError(COMMIT_STATUS_TITLE, msg, sync.api.Dialog.ButtonConfiguration.OK);
      }
      return;
    } else if (err.error == 409) {
      if (err.autoMergeResult.resultType == 'IDENTICAL') {
        self.setStatus('loading');
        self.repo.commitToHead(self.ctx.branch, self.filePath, self.ctx.content, self.ctx.message,
          goog.bind(self.finalizeCommit_, self, self.repo, self.ctx.branch, self.ctx.content));
        return;
      }

      var dialogElement = this.createMergeDialog_(err, {merge: true, branch: true, overwrite: true});

      var choices = dialogElement.querySelectorAll('#gh-commit-diag-content > .gh-commit-diag-choice');
      for (var i = 0; i < choices.length; i++) {
        choices[i].addEventListener('click', goog.bind(this.handleCommitIsNotAFastForward, this, err.commit, choices[i].getAttribute('id')));
      }

      return;
    } else if (err.error == 401) {
      msg = tr(msgs.NOT_AUTHORIZED_);

      // Clear the github credentials to make sure the login dialog is shown when the page is refreshed
      clearGithubCredentials();
    } else if (err.error == 422) {
      var response = JSON.parse(err.request.responseText);
      msg = response.message;
    }

    errorReporter.showError(COMMIT_STATUS_TITLE, msg, sync.api.Dialog.ButtonConfiguration.OK);
  };

  /**
   * Handle the situation when a user commits to a repository and someone else has committed in the meantime as well
   * @param {{blobSha: string, sha: string, branch: string}} commit The commit which failed and the user can choose
   *        what to do with it
   * @param {string} elementId The id of the clicked element
   * @param {object} opt_repo The repo on which to commit
   * @param {goog.ui.Dialog.Event} event The triggering event
   */
  CommitAction.prototype.handleCommitIsNotAFastForward = function (commit, elementId, event) {
    var self = this;
    var repo = self.repo;

    switch (elementId) {
      case 'createBranch': // BRANCH
        errorReporter.hide();
        self.setStatus('loading');

        var candidateBranch = self.ctx.branch + self.getNewBranchSuffix_() + '-1';

        self.checkBranchExists_(repo, candidateBranch, function checked (exists) {
          if (exists) {
            var match = candidateBranch.match(/(.+-)(\d+)$/);
            var rest = match[1];
            var number = parseInt(match[2]) + 1; // The branch already exists so try with a new, incremented, one.
            candidateBranch = rest + number;

            self.checkBranchExists_(repo, candidateBranch, checked);
            return;
          }

          self.ctx.branch = candidateBranch;

          self.createBranch_(repo, self.ctx, function (err) {
            if (!err) {
              // Committing on the newly created branch without merging. Just the current changes.
              repo.commitToHead(candidateBranch, self.filePath, self.ctx.content, self.ctx.message,
                goog.bind(self.finalizeCommit_, self, repo, self.ctx.branch, self.ctx.content));
            } else {
              self.setStatus('none');
              errorReporter.showError(COMMIT_STATUS_TITLE, tr(msgs.COULD_NOT_CREATE_NEW_BRANCH_), sync.api.Dialog.ButtonConfiguration.OK);
            }
          });
        });
        break;
      case 'commitAnyway': // MERGE
        errorReporter.hide();
        self.setStatus('loading');
        repo.updateCommit(commit, self.branch, goog.bind(self.finalizeCommit_, self, repo, self.branch, self.ctx.content));
        break;
      case 'overwriteChanges': // OVERWRITE
        errorReporter.hide();
        self.setStatus('loading');
        repo.commitToHead(self.ctx.branch, self.filePath, self.ctx.content, self.ctx.message,
          goog.bind(self.finalizeCommit_, self, repo, self.ctx.branch, self.ctx.content));
        break;
    }
  };

  /**
   * Handle the case when the commit was not a fast forward commit and we may need to merge.
   * @param {object} commitParameters The parameters of the commit.
   * (For the structure of the object look at gatherCommitParameters_)
   * @param {object} commitInfo Information about the commit result.
   * @param elementId The id of the element which was clicked by the user to choose how to resolve the commit.
   * @private
   */
  CommitAction.prototype.handleCommitIsNotAFastForwardJGit_ = function (commitParameters, commitInfo, elementId) {
    switch (elementId) {
    case 'commitAnyway': // MERGE
      errorReporter.hide();
      this.setStatus('loading');

      commitParameters.newFileContent = commitInfo.mergedString;
      commitParameters.initialSha = commitInfo.latestSha;

      commitParameters.merged = true;
      this.performCommitJGit_(commitParameters, goog.bind(this.commitJGitFinalized_, this, commitParameters));
      break;
    case 'overwriteChanges': // OVERWRITE
      errorReporter.hide();
      this.setStatus('loading');

      // Sending the commitParameters because the write parameters are a subset of the commit params.
      this.performWriteJGit_(commitParameters, goog.bind(this.commitJGitFinalized_, this, commitParameters));
      break;
    case 'createBranch': // BRANCH
      this.setStatus('loading');
      this.gatherBranchingDetails_(commitParameters);
      break;
    }
  };

  /**
   * Handle the situation when a user commits to a repository (forked repository, because the initial commit
   * was done on a repository without write access) and someone else has committed in the meantime.
   *
   * @param {{blobSha: string, sha: string, branch: string}} commit The commit which is not a fast forward.
   * @param {string} elementId The HTML element id which was clicked to handle the non-fast forward commit.
   * @param {Github.Repository} repo The repository on which to commit.
   * @param {string} branchName The name of the branch on which the commit was started.
   * @param {Github.Repository} repoToPullInto The repository from which the original file originated and in which to pull.
   * @param {object} pullRequestInfo Information about the pull request.
   * @param {Event} event The click event.
   */
  CommitAction.prototype.handleCommitIsNotAFastForwardOnFork = function (commit, elementId,
                                                                         repo, branchName, repoToPullInto,
                                                                         pullRequestInfo, event) {
    var self = this;

    switch (elementId) {
    case 'commitAnyway': // MERGE
      errorReporter.hide();
      self.setStatus('loading');
      repo.updateCommit(commit, branchName, function (err, commit) {
        if (!err) {
          self.finalizeCommitOnFork_(commit, branchName, repo, repoToPullInto, pullRequestInfo);
        } else {
          self.setStatus('none');
          errorReporter.showError(COMMIT_STATUS_TITLE, tr(msgs.COMMIT_FAILED_), sync.api.Dialog.ButtonConfiguration.OK);
        }
      });
      break;
    case 'overwriteChanges': // OVERWRITE
      errorReporter.hide();
      self.setStatus('loading');

      repo.commitToHead(branchName, self.filePath, self.ctx.content, self.ctx.message, function (err, commit) {
        if (!err) {
          self.finalizeCommitOnFork_(commit, branchName, repo, repoToPullInto, pullRequestInfo);
        } else {
          self.setStatus('none');
          errorReporter.showError(COMMIT_STATUS_TITLE, tr(msgs.COMMIT_FAILED_), sync.api.Dialog.ButtonConfiguration.OK);
        }
      });
      break;
    }
  };

  /**
   * Called to fork the current github working repository
   * @param {goog.ui.Dialog.Event} event The triggering event
   * @param {string} newBranchName The name of the new branch on which to commit.
   * @param {function} cb The method to call after the fork has been done.
   */
  CommitAction.prototype.doFork = function (event, newBranchName, cb) {
    var self = this;

    if (event.key == 'yes') {
      var chosenBranch = self.ctx.branch;

      // Set to show the spinning loading
      self.setStatus('loading');

      var repositoryUri = self.fileLocation_.repositoryUri;
      self.gitAccess_().createFork(repositoryUri, function (err, forkedRepositoryUri) {
        if (err) {
          cb(err);
        } else {
          // If the user chose to commit on a different branch from the current document branch and that branch does not
          // exist in the source repository we should branch from the initial document branch instead of the chosen branch.
          self.checkIfBranchExists_(repositoryUri, self.ctx.branch, function (err, result) {
            self.branchExistsInSourceRepo = result.branchExists;
            var sourceBranch = chosenBranch;
            if (!result.branchExists) {
              sourceBranch = self.branch;
            }

            self.gitAccess_().branchFromRepoToRepo(repositoryUri,
              sourceBranch, forkedRepositoryUri, newBranchName, function (err, destinationBranch) {

                cb(err, {
                  sourceBranch: sourceBranch,
                  sourceRepositoryUri: repositoryUri,

                  destinationBranch: destinationBranch,
                  forkedRepositoryUri: forkedRepositoryUri
                });
              });
          });
        }
      });
    }
  };

  /**
   * Checks whether a given branch exists in the commit repository.
   * This method works only on GitHub
   *
   * @param {Github.Repository} repo The repository in which to check if the given branch exists.
   * @param {string} branchName The name of the branch.
   * @param {function(boolean, string)} cb The method to call to signal whether the branch exists or not.
   *
   * @private
   */
  CommitAction.prototype.checkBranchExists_ = function (repo, branchName, cb) {
    var apiPath = '/repos/' + repo.getUser() + '/' + repo.getRepo() + '/contents/';
    // Making a fast HEAD request to check if the chosen branch exists.
    // #safe# Called only when JGit is off.
    Github.apiRequest('HEAD', apiPath + '?ref=' + encodeURIComponent(branchName), null, function (err) {
      cb(!err, branchName);
    });
  };

  /**
   * Writes the current file to the chosen branch
   * @param {Github.Repository} repo The repo to write on.
   * @param {string} branchName The name of the branch on which to commit.
   * @param {object} pullRequestInfo Information about the pull request.
   *
   * @private
   */
  CommitAction.prototype.commitToForkedRepo_ = function (repo, branchName, pullRequestInfo) {
    var self = this;

    self.getLatestFileVersion(branchName, repo, function (err, latestFile) {
      var initialRepo = self.repo;

      if (err === 'not found') { //
        // Create the file.
        repo.createFile(branchName, self.filePath, self.ctx.content, self.ctx.message, function (err, result) {
          if (err) {
            self.setStatus('none');
            errorReporter.showError(COMMIT_STATUS_TITLE,
              tr(msgs.FAILED_TO_CREATE_FILE_ON_FORK_), sync.api.Dialog.ButtonConfiguration.OK);
            return;
          }

          /**
           * Setting the documentSha, documentCommit, self.repo, etc for when we might
           * "hot-reload" the document without refreshing the page
           */
          documentSha = result.content.sha;
          documentCommit = result.commit.sha;
          initialDocument = self.ctx.content;

          // Save the current branch for creating the pull request.
          self.previousBranch = self.branch;

          // Set our working branch to the new branch (The opened document is now on the new branch)
          self.branch = self.ctx.branch;

          // The active repo is the forked repo
          self.repo = repo;

          if (pullRequestInfo.doPullRequest) {
            var commitHeadUrl = null;
            if (!err) {
              commitHeadUrl = result.commit.html_url;
            }
            self.openPullRequest_(repo, initialRepo, branchName, pullRequestInfo, commitHeadUrl);
            return;
          }

          self.setStatus('success');
          var branch = '<a target="_blank" href="' + result.commit.html_url + '">' + self.ctx.branch + '</a>';
          errorReporter.showError(COMMIT_STATUS_TITLE,
              tr(msgs.COMMIT_SUCCESSFUL_ON_BRANCH_, {'$BRANCH_NAME': branch}), sync.api.Dialog.ButtonConfiguration.OK);

          var forkedRepositoryUri = 'https://github.com/' + repo.getUser() + '/' + repo.getRepo();

          goog.events.listenOnce(errorReporter.errDialog.dialog, goog.ui.Dialog.EventType.SELECT,
            goog.bind(self.handleReloadOnNewBranch, self, true, null, forkedRepositoryUri));
        });
      } else if (err) {
        self.setStatus('none');
        errorReporter.showError(COMMIT_STATUS_TITLE,
            tr(msgs.COULD_NOT_COMMIT_ON_FORK_REPO_), sync.api.Dialog.ButtonConfiguration.OK);
      } else if (latestFile.sha === documentSha) {
        repo.commitToHead(branchName, self.filePath, self.ctx.content, self.ctx.message, function(err, commit) {
          var msg;
          if (err && err.error == 404) {
            self.setStatus('none');
            msg = tr(msgs.REPOSITORY_NOT_FOUND_)
          } else if (err) {
            self.setStatus('none');
            msg = tr(msgs.ERROR_);
          } else {
            documentSha = commit.blobSha;
            documentCommit = commit.sha;
            initialDocument = self.ctx.content;

            // # safe #
            Github.apiRequest('GET', commit.head.url, null, function (err, response) {
              var msg;

              if (pullRequestInfo.doPullRequest) {
                var commitHeadUrl = null;
                if (!err) {
                  commitHeadUrl = response.html_url;
                }
                self.openPullRequest_(repo, initialRepo, branchName, pullRequestInfo, commitHeadUrl);
                return;
              }

              var branch = (err) ? self.ctx.branch :
                '<a target="_blank" href="' + response.html_url + '">' + branchName + '</a>';
              msg = tr(msgs.COMMIT_SUCCESSFUL_ON_BRANCH_, {'$BRANCH_NAME': branch});

              self.setStatus('success');
              errorReporter.showError(COMMIT_STATUS_TITLE, msg, sync.api.Dialog.ButtonConfiguration.OK);

              var forkedRepositoryUri = 'https://github.com/' + repo.getUser() + '/' + repo.getRepo();

              goog.events.listenOnce(errorReporter.errDialog.dialog, goog.ui.Dialog.EventType.SELECT,
                goog.bind(self.handleReloadOnNewBranch, self, true, branchName, forkedRepositoryUri));
            });

            self.previousBranch = self.branch;

            // Set our working branch to the new branch (The opened document is now on the new branch)
            self.branch = branchName;

            // The active repo is the forked repo
            self.repo = repo;
            return;
          }

          errorReporter.showError(COMMIT_STATUS_TITLE, msg, sync.api.Dialog.ButtonConfiguration.OK);
        });
      } else {
        // Create a new context with the new, generated, branch name.
        var newCtx = goog.object.clone(self.ctx);
        newCtx.branch = branchName;

        self.startMergingCommit_(repo, newCtx, latestFile.content, function (err, commit) {
          if (err.error == 409) {
            self.setStatus('none');
            var dialogElement = self.createMergeDialog_(err, {merge: true, overwrite: true});

            var choices = dialogElement.querySelectorAll('#gh-commit-diag-content > .gh-commit-diag-choice');
            for (var i = 0; i < choices.length; i++) {
              choices[i].addEventListener('click', goog.bind(self.handleCommitIsNotAFastForwardOnFork,
                self, err.commit, choices[i].getAttribute('id'), repo, branchName, initialRepo, pullRequestInfo));
            }
          } else {
            self.handleErrors(err);
          }
        }, true);
      }
    });
  };

  /**
   * Creates the dialog which is shown when a merge might be needed,
   * @param {object} err The error that triggered the merging.
   * @param {string} err.autoMergeResult Object with properties: differentBranch, resultType Telling how the merge ended.
   * @param {object} err.diff The github diff object containg information about the merge.
   * @param {object} actions A map with the actions which should be displayed in the dialog.
   *                         The available actions are: merge, fork and overwrite.
   * @param {string=} opt_message A optional message to show to the user.
   *
   * @private
   */
  CommitAction.prototype.createMergeDialog_ = function (err, actions, opt_message) {
    var result = err.autoMergeResult;

    var userMessage = tr(msgs.COMMIT_MAY_HAVE_CONFLICTS_);

    if (opt_message) {
      userMessage = opt_message;
    } else {
      if (result && !result.differentBranch) {
        switch (result.resultType) {
        case 'CLEAN':
          userMessage = tr(msgs.MERGE_CLEAN_);
          break;
        case 'WITH_CONFLICTS':
          userMessage = tr(msgs.MERGE_WITH_CONFLICTS_);
          break;
        }
      } else {
        switch (result.resultType) {
        case 'CLEAN':
          userMessage = tr(msgs.MERGE_DIFFERENT_BRANCH_);
          break;
        case 'WITH_CONFLICTS':
          userMessage = tr(msgs.MERGE_DIFFERENT_BRANCH_);
          break;
        }
      }
    }

    var gotLink = '';
    if (err.diff.permalink_url) {
      gotLink = tr(
        msgs.CLICK_HERE_THEN_CHOOSE_,
        {
          '$ANCHOR_START': ' <a target="_blank" href = "' + err.diff.permalink_url + '">',
          '$ANCHOR_END': '</a>'
        }
      ) + ': ';
    }

    var commitDialog = '<div id="gh-commit-diag-content">' +
      '<div class="gh-commit-info-prolog">' + userMessage + gotLink + '</div>';

    if (result.resultType == 'CLEAN' && actions.merge) {
      commitDialog +=
        '<div id="commitAnyway" class="gh-commit-diag-choice gh-default-choice" ' +
          'title="' + tr(msgs.MERGE_AND_COMMIT_TITLE_) + '">' +
        '<span class="gh-commit-diag-icon gh-commit-merge"></span>' +
        '<div class="gh-commit-diag-title">' + tr(msgs.MERGE_AND_COMMIT_) + '</div>' +
        '</div>';
    }
    if (actions.branch) {
      commitDialog +=
        '<div id="createBranch" class="gh-commit-diag-choice" ' +
          'title="' + tr(msgs.COMMIT_ON_NEW_BRANCH_TITLE_) + '">' +
        '<span class="gh-commit-diag-icon gh-commit-fresh"></span>' +
        '<div class="gh-commit-diag-title">' + tr(msgs.COMMIT_ON_NEW_BRANCH_) + '</div>' +
        '</div>';
    }
    if (actions.overwrite) {
      commitDialog +=
        '<div id="overwriteChanges" class="gh-commit-diag-choice" ' +
          'title="' + tr(msgs.GIT_OVERWRITE_CHANGES_TITLE_) + '">' +
        '<span class="gh-commit-diag-icon gh-commit-overwrite"></span>' +
        '<div class="gh-commit-diag-title">' + tr(msgs.GIT_OVERWRITE_CHANGES_) + '</div>' +
        '</div>';
    }

    commitDialog += '</div>';

    errorReporter.showError(COMMIT_STATUS_TITLE, commitDialog, sync.api.Dialog.ButtonConfiguration.CANCEL);

    var dialogElement = errorReporter.errDialog.getElement();
    errorReporter.errDialog.setPreferredSize(450, null);

    var commitMerge = dialogElement.querySelector('.gh-commit-merge');
    if (commitMerge) {
      commitMerge.style.backgroundImage = 'url("' +
        sync.util.computeHdpiIcon('../plugin-resources/github-static/git_merge36.png') + '")';
    }
    var commitOnBranch = dialogElement.querySelector('.gh-commit-fresh');
    if (commitOnBranch) {
      commitOnBranch.style.backgroundImage = 'url("' +
        sync.util.computeHdpiIcon('../plugin-resources/github-static/git_branch36.png') + '")';
    }
    var commitMine = dialogElement.querySelector('.gh-commit-overwrite');
    if (commitMine) {
      commitMine.style.backgroundImage = 'url("' +
        sync.util.computeHdpiIcon('../plugin-resources/github-static/git_commit36.png') + '")';
    }

    return dialogElement;
  };

  /**
   * Opens a pull request for the current commit.
   *
   * @param {Github.Repository} sourceRepo The repo to pull from.
   * @param {Github.Repository} destinationRepo The repo to pull into.
   *
   * @param {string} branchName The name of the newly created branch.
   * @param {object} pullRequestInfo Pull request info.
   * @param {string=} commitHtmlUrl The github url of the current successful commit.
   *
   * @private
   */
  CommitAction.prototype.openPullRequest_ = function (sourceRepo, destinationRepo, branchName,
                                                      pullRequestInfo, commitHtmlUrl) {
    var self = this;

    destinationRepo.createPullRequest({
      title: pullRequestInfo.pullMessage,
      head: sourceRepo.getUser() + ':' + branchName,
      base: self.branchExistsInSourceRepo ? self.ctx.branch: self.previousBranch,
      body: pullRequestInfo.pullTitle
    }, function (err, result) {
      var dialogTitle = COMMIT_STATUS_TITLE;

      if (err) {
        if (commitHtmlUrl) {
          var branch = '<a target="_blank" href="' + commitHtmlUrl + '">' + branchName + '</a>';
          errorReporter.showError(dialogTitle,
              tr(msgs.COMMIT_SUCCESSFUL_PULL_FAILED_EXTENDED_,
                  {
                    '$BRANCH_NAME': branch,
                    '$LINE_BREAK': '<br/>'
                  }),
            sync.api.Dialog.ButtonConfiguration.OK);
        } else {
          errorReporter.showError(dialogTitle,
              tr(msgs.COMMIT_SUCCESSFUL_PULL_FAILED_EXTENDED_,
                  {
                    '$BRANCH_NAME': branchName,
                    '$LINE_BREAK': '<br/>'
                  }),
            sync.api.Dialog.ButtonConfiguration.OK);
        }
      } else {
        var anchor = '<a target="_blank" href="' + result.html_url + '">' + tr(msgs.PULL_REQUEST_) + '</a>';
        errorReporter.showError(dialogTitle,
            tr(msgs.PULL_REQUEST_SUCCESSFUL_, {'$PULL_REQUEST': anchor}),
          sync.api.Dialog.ButtonConfiguration.OK);
      }

      self.setStatus('success');

      var forkedRepositoryUri = 'https://github.com/' + sourceRepo.getUser() + '/' + sourceRepo.getRepo();

      goog.events.listenOnce(errorReporter.errDialog.dialog, goog.ui.Dialog.EventType.SELECT,
        goog.bind(self.handleReloadOnNewBranch, self, true, branchName, forkedRepositoryUri));
    });
  };

  /**
   * Set the status of the GitHub icon.
   *
   * @param {string|Array<string>} status The new status.
   */
  CommitAction.prototype.setStatus = function(status) {
    // Using the addAll and removeAll method which takes array of string.
    // Changing only the innards of the method, leaving the calls unchanged.
    if (status === 'loading') {
      status = ['oxy-spinner', 'oxy-spinner-dark-background'];
    } else {
      status = [status];
    }

    clearTimeout(this.statusTimeout);

    goog.dom.classlist.addAll(this.githubToolbarButton, status);
    goog.dom.classlist.removeAll(this.githubToolbarButton, this.status);

    this.status = status;

    if (status == 'success') {
      this.statusTimeout = setTimeout(
        goog.bind(this.setStatus, this, 'none'), 3200);
    }
  };

  /**
   * @override
   */
  CommitAction.prototype.actionPerformed = function(cb) {
    try {
      if (this.status != 'loading') {
        this.setStatus('none');
        var dialog = this.getDialog();
        var commitFinalizedCallback = goog.bind(this.commitFinalized, this, cb);
        dialog.onSelect(goog.bind(this.detailsProvided, this, commitFinalizedCallback));
        this.showDialog();
      }
    } finally {
      cb();
    }
  };

  /**
   * Action used to switch the currently logged in user.
   * @constructor
   */
  function SwitchUserAction() {
    sync.actions.AbstractAction.call(this);
  }
  goog.inherits(SwitchUserAction, sync.actions.AbstractAction);

  /**
   * The id of this action.
   * @type {string}
   */
  SwitchUserAction.ID = 'Git/SwitchUser';

  /** @override */
  SwitchUserAction.prototype.actionPerformed = function (callback) {
    loginManager.switchUser(function (gitAccess) {
      workspace.getNotificationManager().showInfo(tr(msgs.LOGGED_IN_SUCCESSFULLY_));

      callback(gitAccess);
    });
  };

  /** @override */
  SwitchUserAction.prototype.getDisplayName = function() {
    return tr(msgs.LOGIN_WITH_DIFFERENT_USER_);
  };

  /** @override */
  SwitchUserAction.prototype.getDescription = function() {
    return tr(msgs.LOGIN_WITH_DIFFERENT_USER_DESCRIPTION_);
  };

  /**
   * Loads the github-specific CSS.
   */
  function loadCss() {
    var url = "../plugin-resources/github-static/github.css";
    if (document.createStyleSheet) {
      document.createStyleSheet(url);
    } else {
      var link = goog.dom.createDom('link', {
        href: url,
        rel: "stylesheet",
        type: "text/css"
      });
      goog.dom.appendChild(document.head, link);
    }
  }

  /**
   * The object that handles GitHub logins.
   *
   * @constructor
   */
  function GitHubLoginManager () {
    this.loginDialog = null;
    this.errorMessage = null;
    this.gotRepoAccess = undefined;

    /**
     * The main git access object.
     * @type {syncGit.SyncGitApiBase}
     */
    this.mainGitAccess_ = null;
  }

  /**
   * Set the gotRepoAccess property.
   *
   * @param {boolean} gotRepoAccess True if the logged in user has read access in the current documents repo
   */
  GitHubLoginManager.prototype.setGotRepoAccess = function (gotRepoAccess) {
    this.gotRepoAccess = gotRepoAccess;
  };

  /**
   * @returns {boolean} true - if the user has access to the repository,
   *                    false - if the user doesn't have access to the repository,
   *                    undefined - if we didn't check to see the access.
   */
  GitHubLoginManager.prototype.getGotRepoAccess = function () {
    return this.gotRepoAccess;
  };

  /**
   * Sets the error message variable
   * @param {String} message The error message
   */
  GitHubLoginManager.prototype.setErrorMessage = function (message) {
    this.errorMessage = message;
  };

  /**
   * Switch the logged in user. Let the user re-login.
   * @param {function(GitAccessProvider)} callback The method to call after the user has been switched.
   */
  GitHubLoginManager.prototype.switchUser = function (callback) {
    // Setting the error message to an empty string because by default a file
    // not found message is shown when reseting authenticateUser.
    this.setErrorMessage('');
    this.authenticateUser(goog.bind(function (gitAccess) {
      gitAccess().getUserInformation(function (err, info) {
        if (err) {
          workspace.setUserInfo(tr(msgs.ANONYMOUS_));
          workspace.getNotificationManager().showInfo(tr(msgs.LOGGED_IN_AS_, {'$USER_NAME': tr(msgs.ANONYMOUS_)}));
        } else {
          workspace.setUserInfo(info.user);
          workspace.getNotificationManager().showInfo(tr(msgs.LOGGED_IN_AS_, {'$USER_NAME': info.user}));
        }

        callback(gitAccess);
      });
    }, this), true, true);
  };

  /**
   * Creates the login dialog.
   * @param {function} callback The method to call when the user has logged in.
   * @param {boolean=} usePopup Set to true if we want to execute the OAuth flow inside a popup window.
   */
  GitHubLoginManager.prototype.getLoginDialog = function(callback, usePopup) {
    var self = this;
    if (!this.loginDialog) {
      this.loginDialog = workspace.createDialog();
      this.loginDialog.setButtonConfiguration(sync.api.Dialog.ButtonConfiguration.CANCEL);

      var dialogHtml = '<div class="github-login-dialog">';
      dialogHtml += '<div class="github-login-dialog-error">' + this.errorMessage + '</div>';
      dialogHtml += '<div id="gh-login-button-container"></div>';

      this.loginDialog.getElement().innerHTML = dialogHtml;
      this.loginDialog.setTitle(tr(msgs.GIT_LOGIN_DIALOG_TITLE_));

      if (!isOnDashBoard && !usePopup) { // When using popup don't go to dashboard because
                                         // user is mid session and might lose editing progress.
        this.loginDialog.onSelect(function (key) {
          if (key == 'cancel') {
            // Go to the dashboard view
            window.location.href = window.location.protocol + "//" + window.location.hostname +
              (window.location.port ? ':' + window.location.port : '') + window.location.pathname;
          }
        });
      }
    } else {
      // In case someone meddles with the content we regenerate it
      this.loginDialog.getElement().innerHTML = '<div class="github-login-dialog">' +
        '<div class="github-login-dialog-error">' + this.errorMessage + '</div>' +
        '<div id="gh-login-button-container"></div>';
    }

    var previoudGitLoginBtn = this.loginDialog.getElement().querySelector('.git-login-button');
    if (previoudGitLoginBtn) {
      previoudGitLoginBtn.parentNode.removeChild(previoudGitLoginBtn);
    }

    var gotRepoAccess = this.getGotRepoAccess();
    if (this.oauthProps && this.oauthProps.oauthUrl) {
      var loginButtonContainer = this.loginDialog.dialog.getElement().querySelector('#gh-login-button-container');
      var loginWithGithubButton;

      if (typeof gotRepoAccess == 'undefined') {
        // gotRepoAccess is undefined, this means we didn't check for repo access and this dialog is an initial login dialog
        loginButtonContainer.appendChild(goog.dom.createTextNode(tr(msgs.LOGIN_TO_ACCESS_REPOSITORIES_)));

        loginWithGithubButton = goog.dom.createDom('a', {
            'title': tr(msgs.LOGIN_WITH_GITHUB_TOOLTIP_),
            'href': this.oauthProps.oauthUrl,
            'id': 'github-oauth-button'
          },
          goog.dom.createDom('span', 'github-icon-octocat-large'),
          goog.dom.createDom('span', 'github-oauth-text', tr(msgs.LOGIN_WITH_GITHUB_))
        );

        loginButtonContainer.appendChild(loginWithGithubButton);
      } else if (gotRepoAccess === false) {
        // gotRepoAccess is false, this means we checked for access so this file is either not found or not accessible,
        // so show a more meaningful login dialog

        loginWithGithubButton = goog.dom.createDom('a', {
            'title': tr(msgs.LOGIN_WITH_GITHUB_TOOLTIP_),
            'href': this.oauthProps.oauthUrl,
            'id': 'github-oauth-button'
          },
          goog.dom.createDom('span', 'github-icon-octocat-large'),
          goog.dom.createDom('span', 'github-oauth-text', tr(msgs.RELOGIN_WITH_GITHUB_))
        );

        loginButtonContainer.appendChild(loginWithGithubButton);
      }
      var loginButton = loginButtonContainer.querySelector('.github-icon-octocat-large');
      if (loginButton) {
        loginButton.style.backgroundImage = 'url("' + sync.util.computeHdpiIcon('../plugin-resources/github-static/LogoToolbar.png') + '")';
      }

      // WA-623: It is possible for a user to authenticate in another tab.
      // So if the user is already authenticated we will simply reload the page.
      var loginLink = loginButtonContainer.querySelector('#github-oauth-button');
      if (loginLink != null) {
        goog.events.listen(loginLink, [goog.events.EventType.CLICK, goog.events.EventType.TOUCHEND], function (e) {
          switch (!!usePopup) {
          case true:
            var gitAccess = self.createGitAccess();
            var started = false;

            if (gitAccess) { // If the user has authenticated in a different tab.
              callback(gitAccess);
              started = true;
            } else {
              var oauthFlowUrl = e.currentTarget.getAttribute('href');
              started = self.startPopupFlow_(oauthFlowUrl, callback);
            }

            if (started) {
              e.preventDefault();
              e.stopPropagation(); // Listening on CLICK and TOUCHEND, don't want this method to be called for both.
              break;
            }
          // Intentional fall-through if !started
          case false:
            try {
              var accessToken = JSON.parse(localStorage.getItem(GIT_CREDENTIALS_KEY)).token;

              if (accessToken) {
                // simply reload the page, no need to follow the OAuth flow because we are already logged in.
                e.preventDefault();
                e.stopPropagation();

                window.location.reload();
              } // else, let the link be followed
            } catch (e) {/* If the access token is missing JSON.parse will throw error */}
            break;
          }
        });
      }
    }

    if (this.errorMessage !== tr(msgs.FILE_NOT_FOUND_)) {
      // ## Login with user pass section ##

      var gitLogoImage = goog.dom.createDom('span', 'git-logo-image');
      gitLogoImage.style.backgroundImage = 'url("' + sync.util.computeHdpiIcon('../plugin-resources/github-static/Git-logo24.png') + '")';

      var userPassLoginButton = goog.dom.createDom('div', {
          'class': 'git-login-button',
          'title': tr(msgs.LOGIN_USER_PASS_TOOLTIP_)
        },
        gitLogoImage,
        goog.dom.createDom('span', 'git-login-text', tr(msgs.LOGIN_USER_PASS_))
      );
      // Google closure does not set the 'tabindex' attribute for whatever reason, so I'm setting it manually.
      userPassLoginButton.setAttribute('tabindex', '0');

      this.loginDialog.getElement().appendChild(userPassLoginButton);

      goog.events.listenOnce(userPassLoginButton, goog.events.EventType.CLICK,
        goog.bind(this.renderGitLoginForm_, this, this.loginDialog.getElement(), userPassLoginButton, callback));
      // \## Login with user pass section ##
    }

    var errorMessageElement = this.loginDialog.getElement().querySelector('.github-login-dialog-error');
    if (this.errorMessage) {
      errorMessageElement.innerHTML = this.errorMessage;
      errorMessageElement.style.display = 'block';

      if (gotRepoAccess === false) {
        // #safe# - gotRepoAccess is undefined when not on GitHub.
        Github.apiRequest('GET', '/users/' + fileLocation.user, null, function (err, owner) {
          var contactInfo;

          if (!err && owner.email) {
            contactInfo = 'mailto:' + owner.email + '?subject=' + tr(msgs.GITHUB_ACCESS_REQUEST_);
          } else {
            contactInfo = 'https://github.com/' + fileLocation.user;
          }

          var contactOwner = tr(
              msgs.CONTACT_REPOSITORY_OWNER_,
              {
                '$ANCHOR_START': '<a href="' + contactInfo + '">',
                '$ANCHOR_END': '</a>'
              }) + '<br/>';

          var goToGitHub = tr(msgs.GO_TO_GITHUB_RELOGIN_,
              {
                '$ANCHOR_START': '<a href="https://github.com/" target="_blank">',
                '$ANCHOR_END': '</a>',
                '$BUTTON_NAME': tr(msgs.RELOGIN_WITH_GITHUB_)
              });

          errorMessageElement.innerHTML +=
            '<input id="gh-err-auth-chk-box" type="checkbox" class="expandable-err-msg-check" />' +
            '<div class="expandable-err-msg">' +
              tr(msgs.TWO_POSSIBLE_REASONS_) +
              '<ul>' +
                '<li>' + tr(msgs.FILE_DOES_NOT_EXIST_) + '</li>' +
                '<li>' + tr(msgs.NO_READ_FILE_ACCESS_) + '</li>' +
              '</ul>' +
              contactOwner + goToGitHub +
            '</div>' +
            '<label for="gh-err-auth-chk-box" class="expandable-err-msg-more" ' +
               + 'oxycaption-more="...' + tr(msgs.MORE_) + '" oxycaption-less="...' + tr(msgs.LESS_) + '"></label>';
        });
      }
    } else {
      errorMessageElement.style.display = 'none';
    }

    return this.loginDialog;
  };

  /**
   * Starts the popup OAuth authentication flow.
   * @param {string} oauthFlowUrl The url to start the OAuth authentication flow.
   * @param {function(GitAccessProvider)} callback The method to call after the popup OAuth flow has finished.
   *
   * @return {boolean} <code>true</code> if the popup window has been opened, <code>false</code> if it has been blocked.
   * @private
   */
  GitHubLoginManager.prototype.startPopupFlow_ = function (oauthFlowUrl, callback) {
    var self = this;

    // Adding "-pop" to the oauth flow url because the last part of it is the state param. And I am using it to
    // signal to the server that this is a "popup flow".
    oauthFlowUrl = oauthFlowUrl + '-pop';

    var windowHandle = window.open(oauthFlowUrl);

    if (windowHandle != null) {
      var interval = setInterval(function () {
        if (goog.string.endsWith(windowHandle.location.pathname, 'plugins-dispatcher/github-oauth/callback')) {
          clearInterval(interval);

          // Wait a bit more to make sure that the connection is not interrupted.
          setTimeout(function () {
            windowHandle.close();

            self.loginDialog.hide();
            self.loginDialog.dispose();
            self.loginDialog = null;

            self.authenticateUser(callback, false, true);
          }, 200);
        }
      }, 200);

      return true;
    } else {
      return false;
    }
  };

  /**
   * Renders the git user-password login form.
   * @param {HTMLElement} dialogContentContainer The dialog content element.
   * @param {HTMLElement} userPassLoginButton The login with git button.
   * @param {function} callback The method to call after the user has logged in.
   */
  GitHubLoginManager.prototype.renderGitLoginForm_ = function (dialogContentContainer, userPassLoginButton, callback) {
    [].forEach.call(dialogContentContainer.childNodes, function (node) {
      if (node != userPassLoginButton) {
        dialogContentContainer.removeChild(node);
      }
    });

    var gitLoginForm = goog.dom.createDom('div', 'git-login-form');

    var usernameInput = goog.dom.createDom('input', {
      'autofocus': 'autofocus',
      'type': 'text',
      'autocorrect': 'off',
      'autocapitalize': 'off'
    });

    var passInput = goog.dom.createDom('input', {
      'type': 'password'
    });

    var emailInput = goog.dom.createDom('input', {
      'type': 'text'
    });

    gitLoginForm.appendChild(goog.dom.createDom('span', null, tr(msgs.USERNAME_) + ':'));
    gitLoginForm.appendChild(goog.dom.createDom('div', 'git-req', usernameInput));

    gitLoginForm.appendChild(goog.dom.createDom('span', null, tr(msgs.PASSWORD_) + ':'));
    gitLoginForm.appendChild(goog.dom.createDom('div', 'git-req', passInput));

    gitLoginForm.appendChild(
        goog.dom.createDom(
            'span', {'title': tr(msgs.EMAIL_TO_SIGN_COMMITS_)},
            tr(msgs.EMAIL_) + ' ',
        goog.dom.createDom(
            'span', {'style': 'color:#7e7e7e;font-size:0.85em;'},
            '(' + tr(msgs.OPTIONAL_) + '):')
        )
    );
    gitLoginForm.appendChild(emailInput);

    dialogContentContainer.insertBefore(gitLoginForm, userPassLoginButton);

    this.loginDialog.dialog.reposition();
    this.loginDialog.setPreferredSize(342, 410);
    usernameInput.focus();

    goog.events.listen(usernameInput, goog.events.EventType.FOCUS, clearRequiredIndicator_);
    goog.events.listen(passInput, goog.events.EventType.FOCUS, clearRequiredIndicator_);

    function clearRequiredIndicator_ (e) {
      goog.dom.classlist.remove(userPassLoginButton, 'activated');
      goog.dom.classlist.remove(e.currentTarget.parentNode, 'on');
    }

    var boundLoginWithEnter = goog.bind(loginWithEnter_, this);

    goog.events.listen(passInput, goog.events.EventType.KEYDOWN, boundLoginWithEnter);
    goog.events.listen(emailInput, goog.events.EventType.KEYDOWN, boundLoginWithEnter);
    goog.events.listen(userPassLoginButton, goog.events.EventType.KEYDOWN, boundLoginWithEnter);
    goog.events.listen(userPassLoginButton, goog.events.EventType.CLICK, goog.bind(login_, this));

    // WA-784: Making sure that the login dialog grows back to its preferred size when the touch keyboard disappears.
    var resizeListenerKey = goog.events.listen(window, goog.events.EventType.RESIZE, goog.bind(function () {
      var self = this;
      clearTimeout(self.resizeUsrPassTimeout_);
      self.resizeUsrPassTimeout_ = setTimeout(function () {
        self.loginDialog.setPreferredSize(342, 410);
      }, 100);
    }, this));
    goog.events.listenOnce(this.loginDialog.dialog, goog.ui.Dialog.EventType.AFTER_HIDE, function () {
      goog.events.unlistenByKey(resizeListenerKey);
    });

    function login_ () {
      var username = usernameInput.value;
      var password = passInput.value;
      var email = emailInput.value;

      var allGood = true;

      if (!username) {
        allGood = false;
        goog.dom.classlist.add(usernameInput.parentNode, 'on');
      }

      if (!password) {
        allGood = false;
        goog.dom.classlist.add(passInput.parentNode, 'on');
      }

      if (allGood) {
        this.sendUsrPassToServ_(username, password, email, callback);
      }
    }

    function loginWithEnter_ (e) {
      if (e.keyCode === goog.events.KeyCodes.ENTER) {
        goog.dom.classlist.add(userPassLoginButton, 'activated');
        login_.call(this);
      }
    }
  };

  /**
   * Sends the username and password to the server to login.
   * @param {string} username The username to login with.
   * @param {string} password The password to login with.
   * @param {string=} email The email of the user loggin in.
   * @param {function} callback The method to call after the user has logged in.
   * @private
   */
  GitHubLoginManager.prototype.sendUsrPassToServ_ = function (username, password, email, callback) {
    var self = this;
    goog.net.XhrIo.send('../plugins-dispatcher/github-oauth/usrpass/', function (e) {
      var request = /** {@type goog.net.XhrIo} */ (e.target);
      var status = request.getStatus();
      var errorMessage;

      switch (status) {
      case 200:
        self.loginDialog.hide();
        self.loginDialog.dispose();
        self.loginDialog = null;

        localStorage.setItem(GIT_CREDENTIALS_KEY, JSON.stringify({
          type: this.USERPASS,
          username: username,
          email: email
        }));

        self.mainGitAccess_ = new syncGit.SyncGitApi();
        self.mainGitAccess_.setUserInformation(username, email);

        var gitAccessProvider = function () {
          return self.mainGitAccess_;
        };
        commitAction && commitAction.setGitAccess(gitAccessProvider);

        // All good, the rest of the function is for error handling.
        return callback(gitAccessProvider);
        break;
      case 400:
        errorMessage = tr(msgs.ERROR_SENDING_CREDENTIALS_);
        break;
      case 500:
        errorMessage = tr(msgs.INTERNAL_SERVER_ERROR_);
        break;
      default:
        errorMessage = tr(msgs.CONNECTION_ERROR_);
      }

      // Show the error message to the user
      var dialogElement = self.loginDialog.getElement();
      var errorMessageElement = goog.dom.createDom('div', 'github-login-dialog-error', errorMessage);

      if (dialogElement.firstChild) {
        dialogElement.insertBefore(errorMessageElement, dialogElement.firstChild);
      } else {
        dialogElement.appendChild(errorMessageElement);
      }
    }, 'POST', JSON.stringify({
      username: username,
      password: password,
      email: email
    }));
  };

  /**
   * Sets the oauth properties required to build the github authenticate url
   *
   * @param {String=} clientId The Github client_id property
   * @param {String=} state The Github state property
   * @param {String=} apiUrl The url prefix of the GitHub api.
   */
  GitHubLoginManager.prototype.setOauthProps = function (clientId, state, apiUrl) {
    apiUrl = apiUrl || 'https://github.com';

    var scopes = 'public_repo,repo';
    if (clientId && state && apiUrl) {
      this.oauthProps = {
        clientId: clientId,
        state: state,
        // Keep the state as the last param because I may add some more information to it to signal popup use.
        oauthUrl: apiUrl + '/login/oauth/authorize?client_id=' + clientId + '&scope=' + scopes + '&state=' + state
      };

      try {
        localStorage.setItem('github.oauthProps', JSON.stringify(this.oauthProps));
      } catch (e) {}
    } else {
      this.oauthProps = null;
      localStorage.removeItem('github.oauthProps');
    }
  };

  /**
   * Constants for the main types of authentications.
   * @type {string}
   */
  GitHubLoginManager.prototype.GITHUB = 'github';
  GitHubLoginManager.prototype.BITBUCKET = 'bitbucket';
  GitHubLoginManager.prototype.GITLAB = 'gitlab';
  GitHubLoginManager.prototype.USERPASS = 'userpass';

  /**
   * Creates a git access object form the user and password or auth token.
   * @return {GitAccessProvider|undefined}
   */
  GitHubLoginManager.prototype.createGitAccess = function() {
    var githubCredentials = localStorage.getItem(GIT_CREDENTIALS_KEY);

    if (githubCredentials) {
      githubCredentials = JSON.parse(githubCredentials);

      if (githubCredentials.type === this.GITHUB) {
        var github = new Github(githubCredentials);

        this.mainGitAccess_ = new syncGit.SyncGithubApi(github);
      } else {
        this.mainGitAccess_ = new syncGit.SyncGitApi();
        this.mainGitAccess_.setUserInformation(githubCredentials.username, githubCredentials.email);
      }

      var gitAccessProvider = goog.bind(function () {
        return this.mainGitAccess_;
      }, this);

      commitAction && commitAction.setGitAccess(gitAccessProvider);

      return gitAccessProvider;
    }

    return undefined;
  };

  /**
   * Clears the GitHub credentials.
   */
  function clearClientSideGithubCredentials() {
    localStorage.removeItem(GIT_CREDENTIALS_KEY);
    localStorage.removeItem(GIT_USER_NAME_KEY);
    localStorage.removeItem(GIT_EMAIL_KEY);
    localStorage.removeItem(GIT_LATEST_URL_KEY);
  }

  /**
   * The github api instance
   */
  var github;

  var githubCredentials = localStorage.getItem(GIT_CREDENTIALS_KEY);
  if (githubCredentials) {
    github = new Github(JSON.parse(githubCredentials));
  }

  /**
   * Returns the github access object asynchronously.
   *
   * @param {Function} cb The method to call when we have the git instance
   * @param {boolean=} usePopup Set to true if we want to execute the OAuth flow inside a popup window.
   */
  GitHubLoginManager.prototype.getCredentials = function(cb, usePopup) {
    var gitAccess = this.createGitAccess();

    if (gitAccess) {
      cb(gitAccess);
      return;
    }

    var dialog = this.getLoginDialog(cb, usePopup);
    dialog.show();

    // Reset the error message to null, it will be set again if needed
    this.setErrorMessage(null);
  };

  /**
   * Handles the user authentication.
   *
   * @param callback method to be called after the user was logged in.
   *  It receives authentication information as a parameter.
   * @param {boolean=} reset Set to true if we want to get a new access token
   * @param {boolean=} usePopup Set to true if we want to execute the OAuth flow inside a popup window.
   */
  GitHubLoginManager.prototype.authenticateUser = function(callback, reset, usePopup) {
    var oldCb = callback;
    var self = this;
    callback = function (gitAccess) {
      oldCb(gitAccess);

      // Update the file-browser logout button.
      fileBrowser.renderTitleBarLogoutButton(fileBrowser.repoConfigArea, true);
    };

    // If we can create a valid github instance, use it
    if (!reset) {
      var gitAccess = this.createGitAccess();
      if (gitAccess) {
        var alreadyGotGitAccess = true;
        callback(gitAccess);
      }
    }

    // But we should also make sure that our github instance is not outdated (invalid client_id/access_token)
    getGitClientIdOrToken(reset, goog.bind(function (err, credentials) {
      if (err || credentials.error) {
        var errMessage = '';
        if (credentials && credentials.error && credentials.error.indexOf('#HGCR')) {
          errMessage =
              '<div>' + tr(msgs.GH_PLUGIN_CANNOT_CONNECT_,
                  {
                    '$ANCHOR_START': '<a target="_blank" href="admin.html#Connection/Proxy">',
                    '$ANCHOR_END': '</a>'
                  }) + '</div>';
        } else if (err.status == 503) {
          errMessage = '<div>' + tr(msgs.CONNECTION_ERROR_) + ': ' + tr(msgs.COULD_NOT_CONNECT_TO_SERVER_) + '</div>';
        } else {
          errMessage =
              '<div>' + tr(msgs.GH_PLUGIN_BAD_CONFIG_,
                  {
                    '$ANCHOR_START': '<a target="_blank" href="admin.html#Plugins">',
                    '$ANCHOR_END': '</a>'
                  }) + '</div>';
        }

        // Clear the oauth props so we won't show the login with github button (The github oauth flow is not available)
        this.setErrorMessage(errMessage);
        this.setOauthProps(null);
        clearClientSideGithubCredentials();

        // On firefox the login dialog appears slightly to the bottom-right if we don't wait here
        setTimeout(goog.bind(this.getCredentials, this, callback, usePopup), 0);
      } else {
        if (credentials.userpass) {
          // Logged in with user/pass and good to go!
          localStorage.setItem(GIT_CREDENTIALS_KEY, JSON.stringify({
            type: this.USERPASS,
            username: credentials.username,
            email: credentials.email
          }));
          if (!alreadyGotGitAccess) {
            var gitAccessUsrPass = this.createGitAccess();
            gitAccessUsrPass().setUserInformation(credentials.username, credentials.email);
            callback(gitAccessUsrPass);
          } else {
            gitAccess().setUserInformation(credentials.username, credentials.email);
          }
        } else if (credentials.accessToken) {
          try {
            var apiUrl = credentials.apiUrl ? credentials.apiUrl + '/api/v3' : null;

            localStorage.setItem(GIT_CREDENTIALS_KEY, JSON.stringify({
              type: this.GITHUB,
              token: credentials.accessToken,
              auth: "oauth",
              apiUrl: apiUrl
            }));
          } catch (e) {}

          // Update our github instance with the potentially new accessToken
          gitAccess = this.createGitAccess();

          var currentOauthProps = JSON.parse(localStorage.getItem('github.oauthProps'));
          if (currentOauthProps &&
              currentOauthProps.clientId === credentials.clientId &&
              currentOauthProps.state === credentials.state &&
              // If we already could make a github instance it means we called callback so we can just return;
              alreadyGotGitAccess) {
              return;
          } else {
            // If we got new oauthProps we will update them and call the callback
            this.setOauthProps(credentials.clientId, credentials.state, credentials.apiUrl);
          }

          callback(gitAccess);
        } else {
          // I will pass in an empty string when reseting and not wanting to show an error message.
          if (reset === true && !this.errorMessage && this.errorMessage !== '') {
            this.setErrorMessage(
                tr(msgs.ERROR_) + ': ' + tr(msgs.NOT_AUTHORIZED_TO_ACCESS_REPO_) + ' / ' + tr(msgs.FILE_NOT_FOUND_)
            );
          }

          // If the server didn't respond with a accessToken that means we should get a new one by starting the oauth
          // flow so remove the github.credentials so that the login dialog can appear.
          clearGithubCredentials();

          // We don't have an access token yet, so use the clientId and state to start the oauth flow
          this.setOauthProps(credentials.clientId, credentials.state, credentials.apiUrl);

          // On firefox the login dialog appears slightly to the bottom-right if we don't wait here
          setTimeout(goog.bind(this.getCredentials, this, callback, usePopup), 0);
        }
      }
    }, this));
  };

  /**
   * The github sha of the opened document (The sha of the file contents).
   */
  var documentSha;

  /**
   * The github commit sha of the opened document (The reference to the commit which produced this document).
   */
  var documentCommit;

  /**
   * The initial value of the document, before the user starts editing
   */
  var initialDocument;

  /**
   * An object describing the location of the opened document (filePath, branch. user, repo)
   */
  var fileLocation;

  // Make sure we accept any kind of URLs.
  goog.events.listenOnce(workspace, sync.api.Workspace.EventType.BEFORE_EDITOR_LOADED, function(e) {
    var url = e.options.url;
    var editor = e.editor;
    if (!isGitUrl(url)) {
      return;
    }

    e.preventDefault();

    var normalizedUrl = normalizeGitFileListUrl_(url);

    var loadingOptions = e.options;
    loadingOptions.url = normalizedUrl;

    fileLocation = getFileLocation(normalizedUrl);

    loginManager.authenticateUser(loadDocument);

    /**
     * Loads the document
     *
     * @param {GitAccessProvider} gitAccess Provides access to git related methods.
     */
    function loadDocument(gitAccess) {
      // WA-785: The "protocol" used to access files should be independent of the document url.
      // It should depend only on the authentication method.
      if (gitAccess() instanceof syncGit.SyncGithubApi) {
        loadingOptions.url = fromListToContentUrl_(loadingOptions.url);
      } else {
        loadingOptions.url = fromContentToListUrl_(loadingOptions.url);
      }

      // Setting the latest url to the current file. So that the file-browser opens the current folder.
      localStorage.setItem(GIT_LATEST_URL_KEY, loadingOptions.url);

      fileBrowser = new GithubFileBrowser(gitAccess);
      // register all the listeners on the file browser.
      registerFileBrowserListeners(fileBrowser);

      var urlAuthor = sync.util.getURLParameter('author');
      if (!urlAuthor) {
        gitAccess().getUserInformation(function (err, info) {
          if (err) {
            loadingOptions.userName = tr(msgs.ANONYMOUS_);
            localStorage.setItem(GIT_USER_NAME_KEY, tr(msgs.ANONYMOUS_));
            localStorage.removeItem(GIT_EMAIL_KEY);
          } else {
            if (!info.user && !info.email) {
              loadingOptions.userName = localStorage.getItem(GIT_USER_NAME_KEY);
            } else {
              loadingOptions.userName = info.user;
              localStorage.setItem(GIT_USER_NAME_KEY, info.user);
              localStorage.setItem(GIT_EMAIL_KEY, info.email);
            }
          }
          loadDocument_(gitAccess);
        });
      } else {
        loadDocument_(gitAccess);
      }
    }

    function loadDocument_ (gitAccess) {
      // The method[1] which triggered the BEFORE_EDITOR_LOADED event will clean the doc container.
      // We want to set a spinner to show the loading status in the doc container element.
      // So we need to wait until the method[1] cleans the element before we add anything else inside it.

      setTimeout(goog.bind(function () {
        // Show a spinner while the document is loading.
        sync.util.showDocumentLoading(sync.util.getDocContainer());

        // Letting the renderer show the loading dialog before starting the time consuming part.
        setTimeout(goog.bind(function() {
          var repositoryUri = fileLocation.repositoryUri;

          gitAccess().getDocument(repositoryUri, fileLocation.branch,
              fileLocation.filePath, goog.bind(function (err, result) {

            if (err) {
              var status = err.status;
              var message = err.message;

              if (gitAccess() instanceof syncGit.SyncGithubApi) {
                switch (status) {
                case 401:
                  clearClientSideGithubCredentials();
                  loginManager.authenticateUser(loadDocument, true);
                  return;
                  break;
                case 404:
                  var repo = gitAccess().getGithubRepo_(fileLocation.repositoryUri);
                  repo.show(function (_, repoAccess) {
                    if (repoAccess) {
                      //
                      loginManager.setErrorMessage(tr(msgs.REQUESTED_FILE_NOT_FOUND_));
                    } else {
                      //
                      loginManager.setErrorMessage(tr(msgs.COULD_NOT_OPEN_FILE_REPO_ACCESS_));
                    }

                    loginManager.setGotRepoAccess(!!repoAccess);

                    // Try to authenticate again.
                    clearClientSideGithubCredentials();
                    loginManager.getCredentials(loadDocument);
                  });
                  return;
                  break;
                }

                // Try to authenticate again.
                loginManager.setErrorMessage(tr(msgs.GIT_ERROR_));
                clearClientSideGithubCredentials();
                loginManager.getCredentials(loadDocument);
                return;
              } else {
                switch (status) {
                case 401:
                  clearClientSideGithubCredentials();
                  loginManager.setErrorMessage(message);
                  loginManager.authenticateUser(loadDocument, true);
                  break;
                case 404: // Adding a case 404 here to document that its being handled in default.
                  loginManager.setErrorMessage(tr(msgs.FILE_NOT_FOUND_));
                  clearClientSideGithubCredentials();

                  // Calling getCredentials to show the login dialog in which the error message will be displayed
                  loginManager.getCredentials(loadDocument);
                  break;
                default:
                  loginManager.setErrorMessage(message);
                  clearClientSideGithubCredentials();

                  // Calling getCredentials to show the login dialog in which the error message will be displayed
                  loginManager.getCredentials(loadDocument);
                  break;
                }
                return;
              }
            }

            documentSha = result.documentSha;
            documentCommit = result.commitSha;

            var fileContent = result.documentContent;

            // Save the initial document for three way merging before committing
            initialDocument = fileContent;

            workspace.setUrlChooser(fileBrowser);

            // Load the retrieved content in the editor.
            loadingOptions.content = fileContent;
            editor.load(loadingOptions);

            goog.events.listenOnce(workspace, sync.api.Workspace.EventType.EDITOR_LOADED, function(e) {

              // TODO (WA-923): Check push access here?

              try {
                var tooltip = new goog.ui.AdvancedTooltip(document.querySelector('#titleDiv'));
                tooltip.getElement().appendChild(goog.dom.createDom('div', 'tooltip-hovercard gh-location-tooltip',
                  tr(msgs.DOCUMENT_INFORMATION_)+ ':',
                  goog.dom.createDom('div', '',
                    tr(msgs.REPOSITORY_) + ': ' + fileLocation.repositoryUri,
                    goog.dom.createDom('br'),
                    tr(msgs.BRANCH_) + ': ' + fileLocation.branch,
                    goog.dom.createDom('br'),
                    tr(msgs.PATH_)+ ': ' + fileLocation.filePath
                  )
                ));
                tooltip.setHotSpotPadding(new goog.math.Box(20, 20, 20, 20));
                tooltip.setShowDelayMs(100);
              } catch (e) {
                console.log('Failed to set the document title tooltip');
              }
            });

            goog.events.listenOnce(editor, sync.api.Editor.EventTypes.ACTIONS_LOADED, function(e) {
              var githubToolbarButton = goog.dom.createDom('div', {
                'id': 'git-toolbar-button',
                'title': 'Git' // this one is probably universal.
              }, '');

              if (sync.options.PluginsOptions.getClientOption('github.client_id')) {
                githubToolbarButton.style.backgroundImage =
                  'url("' + sync.util.computeHdpiIcon('../plugin-resources/github-static/LogoToolbar.png') + '")';
              } else {
                githubToolbarButton.style.backgroundImage =
                  'url("' + sync.util.computeHdpiIcon('../plugin-resources/github-static/Git-logo-white24.png') + '")';
              }

              var commitShortcut = localStorage.getItem('github.shortcut');
              if (commitShortcut && commitShortcut == 'true' || !commitShortcut) {
                // If the commit shortcut is enabled or if we should use the default value
                commitShortcut = CommitAction.SHORTCUT;
              } else if (commitShortcut && commitShortcut == 'false') {
                commitShortcut = null;
              }

              commitAction = new CommitAction(editor, gitAccess, fileLocation);
              commitAction.setGithubToolbarButton(githubToolbarButton);

              // Add the github commit and logout actions to the main toolbar
              var commitActionId = installCommitAction(editor, commitAction, commitShortcut);
              // var switchUserActionId = installSwitchUserAction(editor, new SwitchUserAction());
              var logOutActionId = installLogoutAction(editor, new LogOutAction(editor));

              addToolbarToBuiltinToolbar(e.actionsConfiguration, {
                type: "list",
                iconDom: githubToolbarButton,
                name: "Git",
                children: [
                  {id: commitActionId, type: "action"},
                  {id: logOutActionId, type: "action"}
                ]
              });
            });
          }, this));
        }, this), 0);
      }, this), 0);
    }
  }, true);

  /**
   * Gets the git access token or client_id
   *
   * @param {boolean=} reset If true, will trigger a new OAuth flow for getting a new access token (called with true when the access token expires)
   * @param {function(err: Object, credentials: {accessToken: String, clientId: String, state: String, error: String})} callback The method to call on result
   */
  function getGitClientIdOrToken(reset, callback) {
    if (reset) {
      clearClientSideGithubCredentials();
      localStorage.removeItem('github.oauthProps');
    }

    var localStorageCredentials = JSON.parse(localStorage.getItem(GIT_CREDENTIALS_KEY)) || {};
    var localStorageOauthProps = JSON.parse(localStorage.getItem('github.oauthProps')) || {};

    var accessToken = localStorageCredentials.token || '';
    var clientId = localStorageOauthProps.clientId || '';
    var state = localStorageOauthProps.state || '';

    var xhrRequest = new XMLHttpRequest();

    xhrRequest.open('POST', '../plugins-dispatcher/github-oauth/github_credentials/', true);

    xhrRequest.onreadystatechange = function () {
      if (xhrRequest.readyState == 4) {
        if (xhrRequest.status == 200) {
          var response = JSON.parse(xhrRequest.responseText);

          callback(null, {
            userpass: response.userpass, // boolean
            username: response.username,
            email: response.email,

            apiUrl: response.api_url,
            accessToken: response.access_token,
            clientId: response.client_id,
            state: response.state,
            error: response.error
          });
        } else if (xhrRequest.status == 503 || xhrRequest.status == 0) {
          callback({
            status: 503,
            message: tr(msgs.SERVICE_UNAVAILABLE_)
          });
        } else if (xhrRequest.status >= 100) {
          // When the request status is < 100 it means the request was terminated abruptly... (No internet access)
          callback({
            status: 500,
            message: tr(msgs.OAUTH_UNAVAILABLE_)
          });
        }
      }
    };

    var redirectTo = location.href;
    if (callOnReturn) {
      redirectTo = location.protocol + "//" +
          location.hostname + (location.port ? ':' + location.port : '') +
          location.pathname + location.search + '#' + callOnReturn
    }

    // Send the current url. It will be needed to redirect back to this page
    // Also send the oauth related props so that we can synchronize with the server, in case we need new credentials
    xhrRequest.send(JSON.stringify({
      redirectTo: redirectTo,
      reset: reset,

      accessToken: accessToken,
      clientId: clientId,
      state: state
    }));
  }

  /**
   * Clears the github credentials from the client and from the server
   */
  function clearGithubCredentials() {
    clearClientSideGithubCredentials();

    var xhrRequest = new XMLHttpRequest();
    xhrRequest.open('POST', '../plugins-dispatcher/github-oauth/github_reset_access/', false);
    xhrRequest.send();
  }

  /**
   * Returns an object representing the file location
   * @param {string} url The url of the file.
   *              (It should always be github url: github://(getFileContents|getFileList)/:user/:repo/:branch/:path)
   * @returns {{user: string, repo: string, branch: string, filePath: string}} The file location descriptor.
   */
  function getFileLocation(url) {
    // WA-781
    var fragmentIndex  = url.lastIndexOf('#');
    if (fragmentIndex != -1) {
      url = url.substring(0, fragmentIndex);
    }

    var urlObj = new goog.Uri(url);
    var path = urlObj.getPath();
    var pathSplit = path.split('/');

    // In some browsers, the pathname starts with a "/".
    if (pathSplit[0] === "") {
      pathSplit = pathSplit.slice(1);
    }

    if (url.indexOf('github://getFileList') === 0) {
      var userRepo = decodeURIComponent(pathSplit[0]).match(/\/([^/]+)\/([^/]+)\/?$/);

      var matches = url.match(/github:\/\/getFileList\/([^/]+)\/([^/]+)\/(.+)/);

      var repositoryUri = decodeURIComponent(matches[1]);
      var branch = decodeURIComponent(matches[2]);
      var filePath = matches[3].split('/').map(decodeURIComponent).join('/');

      return {
        user: userRepo[1],
        repo: userRepo[2],
        branch: branch,
        filePath: filePath,
        repositoryUri: repositoryUri
      };
    } else {
      return {
        user: pathSplit[0],
        repo: pathSplit[1],
        branch: decodeURIComponent(pathSplit[2]),
        filePath: pathSplit.slice(3).map(decodeURIComponent).join("/"),
        repositoryUri: 'https://github.com/' + pathSplit[0] + '/' + pathSplit[1]
      };
    }
  }

  /**
   * Adds a toolbar to the builtin toolbar
   *
   * @param {object} actionsConfig Configuration object
   * @param {object} toolbarToAdd The description of the toolbar to add
   */
  function addToolbarToBuiltinToolbar(actionsConfig, toolbarToAdd) {
    var builtinToolbar = null;
    if (actionsConfig.toolbars) {
      for (var i = 0; i < actionsConfig.toolbars.length; i++) {
        var toolbar = actionsConfig.toolbars[i];
        if (toolbar.name == "Builtin") {
          builtinToolbar = toolbar;
          break;
        }
      }
    }

    if (builtinToolbar) {
      var lastToolbarItem = builtinToolbar.children.pop();
      builtinToolbar.children.push(toolbarToAdd);
      if (lastToolbarItem) {
        builtinToolbar.children.push(lastToolbarItem);
      }
    }
  }

  /**
   * Installs the Commit action in the toolbar.
   *
   * @param {sync.api.Editor} editor The editor
   * @param {sync.actions.AbstractAction} commitAction The commit-to-github action.
   * @param {string} shortcut String representing the key combination which triggers this action
   * @returns {string}
   */
  function installCommitAction(editor, commitAction, shortcut) {
    // Remove the save action from the toolbar (remove the ctrl + s == save document shortcut)
    editor.getActionsManager().unregisterAction('Author/Save');

    editor.getActionsManager().registerAction(CommitAction.ID, commitAction, shortcut);
    return CommitAction.ID;
  }

  /**
   * Sets the key stroke shortcut for the commit action.
   * @param {sync.api.Editor} editor The editor.
   * @param {string} shortcut String representing the key-stroke which invokes the commit action.
   */
  function setCommitActionShortcut(editor, shortcut) {
    editor.getActionsManager().setActionShortcut(CommitAction.ID, shortcut);
  }

  /**
   * Installs the switch user action in the actions manager.
   * @param {sync.api.Editor} editor The editor.
   * @param {SwitchUserAction} switchUserAction The switch user action to install.
   */
  function installSwitchUserAction(editor, switchUserAction) {
    editor.getActionsManager().registerAction(SwitchUserAction.ID, switchUserAction);
    return SwitchUserAction.ID;
  }

  /**
   * Installs the logout acion in the toolnar
   * @param {sync.api.Editor} editor The editor
   * @param {sync.actions.AbstractAction} logoutAction The logout action
   * @returns {string}
   */
  function installLogoutAction(editor, logoutAction) {
    var actionId = 'Github/Logout';

    editor.getActionsManager().registerAction(actionId, logoutAction);
    return actionId;
  }

  /**
   * Transforms the given url to a gihub "getFileList" protocol url.
   *
   * @param {string} url The url to normalize.
   * The given url can be a "getFileContent", "github.com" or "raw.githubusercontent.com" url.
   *
   * @returns {string|undefined} The normalized url.
   * @private
   */
  function normalizeGitFileListUrl_(url) {
    var matches;
    var repositoryUrl;
    var branch;
    var path;

    if (url.indexOf('github://getFileList') === 0) {
      // Its already a getFileList url;
      return url;
    } else if (url.indexOf('github://getFileContent') === 0) {
      return fromContentToListUrl_(url);
    }
    else {
      // This is a normal github.com url.
      if (url.match('^https?://(?:www\.)?github.com')) {
        matches = url.match('^https?://(?:www\.)?github.com/([^/]+)/([^/]+)/*(?:blob|tree)/*([^/]*)/*(.*)');
      }
      // This is a RAW github url.
      else if (url.match('^https?://raw.githubusercontent.com')) {
        matches = url.match('^https?://raw.githubusercontent.com/([^/]+)/([^/]+)/*([^/]*)/*(.*)');
      }

      if (!matches) {
        return;
      }

      repositoryUrl = 'https://github.com/' + matches[1] + '/' + matches[2];
      branch = matches[3];
      path = matches[4];

      return 'github://getFileList/' +
        encodeURIComponent(repositoryUrl) + '/' +
        (branch ? encodeURIComponent(branch) + '/' : '') + path;
    }
  }

  /**
   * Changes to github url to a "github protocol" url
   * @param {string} url The URL
   * @returns {string} The normalized URL.
   */
  function normalizeGitUrl(url) {
    if (url.indexOf('github://getFileList') === 0) {
      return fromListToContentUrl_(url);
    }

    return url.replace("https", "github")
      .replace("http", "github")
      .replace("/tree/", "/blob/")
      .replace("/blob/", "/")
      .replace("www.github.com", "getFileContent")
      .replace("github.com", "getFileContent")
      .replace("raw.githubusercontent.com", "getFileContent");
  }

  /**
   * Converts a "getFileContent" url to a "getFileList" url.
   *
   * @param {string} url The url to convert.
   * It should have the format: github://getFileContent/:owner/:repo/:branch/:path/to/file
   *
   * @returns {string|undefined} The converted url or null if the given url was invalid.
   * @private
   */
  function fromContentToListUrl_ (url) {
    if (url && url.indexOf('github://getFileContent') === 0) {
      // [_, owner, repo, branch, path]
      var matches = url.match('github://getFileContent/([^/]+)/([^/]+)/*([^/]*)/*(.*)');

      if (!matches) {
        return;
      }

      var owner = matches[1];
      var repo = matches[2];
      var branch = decodeURIComponent(matches[3]);
      var path = matches[4];

      var repositoryUri = 'https://github.com/' + owner + '/' + repo;

      return 'github://getFileList/' +
        encodeURIComponent(repositoryUri) + '/' +
        (branch ? encodeURIComponent(branch) + '/' : '') + path;
    } else if (url && url.indexOf('github://getFileList') === 0) {
      return url;
    }
  }

  /**
   * Converts a "getFileList" url to a "getFileContent" url.
   *
   * @param {string} url The url to convert.
   * It should have the format: github://getFileList/:repositoryUri/:branch/:path
   *
   * @returns {string|undefined} The converted url or null if the given url was invalid.
   * @private
   */
  function fromListToContentUrl_(url) {
    if (url && url.indexOf('github://getFileList') === 0) {
      // [_, repoUrl, branch, path]
      var matches = url.match('github://getFileList/([^/]+)/*([^/]*)/*(.*)');

      var repositoryUri = decodeURIComponent(matches[1]);
      var branch = matches[2];
      var path = matches[3];

      matches = repositoryUri.match('.*/([^/]*)/([^/]*)');

      var owner = matches[1];
      var repo = matches[2];

      return 'github://getFileContent/' + owner + '/' + repo +
        (branch ? '/' + branch : '') +
        (path ? '/' + path : '');
    } else if (url && url.indexOf('github://getFileContent') === 0) {
      return url;
    }
  }

  /**
   * Checks whether the url points to a git resource.
   * @param {string} url The URL to check
   * @returns {boolean} true if the url points to a github resource
   */
  function isGitUrl(url) {
    if (url.indexOf('github://') == 0) {
      return true;
    }
    if (url.match("^https?://.*")) {
      return url.indexOf('github.com') != -1 ||
        url.indexOf('raw.githubusercontent.com') != -1;
    }
    return false;
  }

  /**
   * Matcher for the repository autocomplete field.
   *
   * @param {GitAccessProvider} gitAccess Provides access to 'git-ish' related methods.
   * @param {HTMLElement} input The input element in which the user
   * will type to choose her repository.
   * @param {[string]} opt_defaultRepos A list of default repositories to show when failing to retrieve other repositories.
   *
   * @constructor
   */
  var GithubRepoChooser = function(gitAccess, input, opt_defaultRepos) {
    this.repos = null;
    this.defaultRepos = opt_defaultRepos;

    // If the match handler is reqested before the repos are available, we record the details.
    this.token_ = null;
    this.handler_ = null;
    this.maxMatches_ = null;

    this.repoUrl = null;

    if (gitAccess) {
      gitAccess().getUserRepositories(goog.bind(this.reposReceived_, this));
    } else {
      console.warn('Missing gitAccess in GithubRepoChooser');
    }

    this.renderer = new goog.ui.ac.Renderer(input.parentNode);
    this.inputhandler = new goog.ui.ac.InputHandler(null, null, false, 300);
    this.ac = new goog.ui.ac.AutoComplete(this, this.renderer, this.inputhandler);
    this.inputhandler.attachAutoComplete(this.ac);
    this.inputhandler.attachInputs(input);
    this.ac.setAutoHilite(false);

    this.eventHandler = new goog.events.EventHandler(this);
    // On focus, expand the suggestions list.
    this.eventHandler.listen(input, goog.events.EventType.FOCUS, goog.bind(function() {
      this.ac.getSelectionHandler().update(true);
    }, this));

    // Different ways to commit.
    this.eventHandler.listen(input, goog.events.EventType.BLUR, goog.bind(function(e) {
      this.setRepo(input);
    }, this), true);

    this.eventHandler.listen(input, goog.events.EventType.PASTE, goog.bind(function(e) {
      setTimeout(goog.bind(function() {
        this.setRepo(input);
      }, this), 0);
    }, this), true);
    this.eventHandler.listen(input, goog.events.EventType.KEYDOWN, goog.bind(function(e) {
      if (e.keyCode == goog.events.KeyCodes.TAB) {
        this.setRepo(input);
      }
    }, this));
    this.eventHandler.listen(input, goog.events.EventType.KEYPRESS, goog.bind(function(e) {
      if (e.keyCode == goog.events.KeyCodes.ENTER) {
        setTimeout(goog.bind(this.setRepo, this, input), 0);
        e.stopPropagation();
      }
    }, this), true);
    this.eventHandler.listen(this.ac, goog.ui.ac.AutoComplete.EventType.UPDATE,
      goog.bind(function(e) {
        if (e.row) {
          this.setRepo(input);
        }
      }, this));

    // Initially, the autocomplete should be focused.
    setTimeout(function() {
      input.focus();
    }, 0);
    goog.events.EventTarget.call(this);
  };
  goog.inherits(GithubRepoChooser, goog.events.EventTarget);

  /**
   * A list of common git providers.
   * @type {string[]}
   */
  GithubRepoChooser.prototype.popularGitProviders = [
    'https://github.com/',
    'https://gitlab.com/',
    'https://bitbucket.org/'
  ];

  /**
   * Received the repositories from GitHub
   * @param {Object=} err The error descriptor if any.
   * @param {Array.<Object>} repos The repositories details.
   * @private
   */
  GithubRepoChooser.prototype.reposReceived_ = function(err, repos) {
    if (err) {
      // No content completion available.
      return;
    }

    this.repos = repos;
    if (this.repos.length === 0 && this.defaultRepos) {
      this.repos = this.defaultRepos;
    }

    if (this.handler_) {
      this.requestMatchingRows(this.token_, this.maxMatches_, this.handler_);
      this.handler_ = null;
      this.maxMatches_ = null;
      this.token_ = null;
    }
  };

  /** @override */
  GithubRepoChooser.prototype.disposeInternal = function() {
    if (this.eventHandler) {
      this.eventHandler.dispose();
      this.eventHandler = null;
    }
    if (this.ac) {
      this.ac.dispose();
      this.ac = null;
    }
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    if (this.inputHandler) {
      this.inputHandler.dispose();
      this.inputHandler = null;
    }
  };

  /** @override */
  GithubRepoChooser.prototype.requestMatchingRows = function(token, maxMatches, matchHandler, opt_fullString) {
    if (this.repos) {
      var matches = this.repos.filter(function (repo) {
        return repo.toLowerCase().indexOf(token.toLowerCase()) != -1;
      });
      goog.array.sort(matches);
      matchHandler(token, matches);
    } else {
      this.handler_ = matchHandler;
      this.token_ = token;
      this.maxMatches_ = maxMatches;
    }
  };

  /**
   * Return the repository with the given URL.
   *
   * @param {string} url The url of the repo.
   * @return {object} the repo descriptor, or null if the repo is not chosen from the list.
   */
  GithubRepoChooser.prototype.getRepoByUrl = function(url) {
    var repo = null;

    var relevantPartOfUrl = url.match('https?://(?:www)?github.com/([^/]+/[^/]+)');

    if (relevantPartOfUrl) {
      url = 'https://github.com/' + relevantPartOfUrl[1];
    }

    if (this.repos) {
      for (var i = 0; i < this.repos.length; i++) {
        if (this.repos[i] === url) {
          repo = this.repos[i];
          break;
        }
      }
    }
    return repo;
  };

  /**
   * Triggers a repo chosen event.
   *
   * @param {HTMLElement} input The input from which to read the value.
   */
  GithubRepoChooser.prototype.setRepo = function(input) {
    var repoUrl = input.value.trim();
    if (repoUrl != this.repoUrl) {
      this.repoUrl = repoUrl;
      this.dispatchEvent({
        type: 'github-repo-chosen',
        url: repoUrl,
        repo: this.getRepoByUrl(repoUrl)
      });
    }
  };

  /**
   * GitHub file browser.
   *
   * @param {GitAccessProvider} gitAccess Provides access to 'git-ish' related methods.
   * @param {{initialUrl: string, ditaMapUrl: string}=} customOpenProperties
   *
   * @constructor
   */
  function GithubFileBrowser(gitAccess, customOpenProperties) {
    var initialUrl;

    /**
     * List of the repositories chosen by the user. Using an object because I want a unique list.
     *
     * @type {object}
     */
    this.defaultRepos = {};

    /**
     * @type {string}
     * @private
     */
    this.gitAccess_ = gitAccess;

    if (customOpenProperties) {
      /**
       * The ditamap which will be added as a ditamap url in files opened with this file browser.
       * @type {string}
       * @private
       */
      this.ditamapUrl_ = customOpenProperties.ditaMapUrl;

      initialUrl = customOpenProperties.initialUrl;
    } else {
      initialUrl = localStorage.getItem(GIT_LATEST_URL_KEY);
      if (!initialUrl) {
        // If there is no URL in localstorage, try with the URL of the current file.
        var paramUrl = sync.util.getURLParameter("url");
        if (paramUrl) {
          if (this.gitAccess_() instanceof syncGit.SyncGithubApi) {
            initialUrl = normalizeGitUrl(decodeURIComponent(paramUrl));
          } else {
            initialUrl = normalizeGitFileListUrl_(decodeURIComponent(paramUrl));
          }
        }
      }
    }

    // If the given initial url is not valid fallback to the latestUrl or none at all.
    var rootUrl;
    try {
      rootUrl = this.extractRootUrl_(initialUrl);
    } catch (e) {
      initialUrl = localStorage.getItem(GIT_LATEST_URL_KEY);
      rootUrl = this.extractRootUrl_(initialUrl);
    }

    sync.api.FileBrowsingDialog.call(this, {
      initialUrl: initialUrl,
      root: rootUrl
    });
    this.branchesForUrl = {};
    // The model of the selected repository in editing mode.
    // - owner
    // - user
    // - rest - intermediate field that holds the part after the repo url
    // - error - an error message to display to the user; defined if the repo could not be opened.
    // - repoDesc - descriptor of the repository (if available)
    // - path (if provided by the user)
    // - branch
    // - isFile (if the URL contains path, whether the specified path is a file or a folder)
    this.repoDetails = null;
    this.keyHandleBranchSelected = null;
    // The repository rendered in the view.
    this.renderedRepo = null;
  }
  goog.inherits(GithubFileBrowser, sync.api.FileBrowsingDialog);

  /**
   * Sets the gitAccess object.
   * @param {GitAccessProvider} gitAccess
   */
  GithubFileBrowser.prototype.setGitAccess = function (gitAccess) {
    this.gitAccess_ = gitAccess;
  };

  /** @override */
  GithubFileBrowser.prototype.retrieveChildrenREST = function (href, success, failure) {
    var self = this;

    var spinner;

    var match = href.match('getFileList/([^/]+)');
    if (match) {
      var repositoryUri = encodeURIComponent(match[1]);

      setTimeout(function () {
        goog.net.XhrIo.send('../plugins-dispatcher/git/clonestatus/' + repositoryUri, function (e) {
          var request = /** {@type goog.net.XhrIo} */ (e.target);

          if (request.getStatus() === 200) {
            var cloning = request.getResponseText(); // true|false
            if (cloning === 'true') {
              // set the cloning text visible on the filebrowser.
              self.filesList.container.setAttribute('oxycaption', tr(msgs.CLONING_FIRST_TIME_));
              spinner = new sync.view.Spinner(self.filesList.container, 1, ['gh-cloning-repo']);
              spinner.show();
            }
          }
        });
      }, 400);
    }

    // If the retrieveChildrenREST method fails because of a timeout net_error we will retry only once.
    var tries = 0;
    (function retrieveChildren_ () {
      GithubFileBrowser.superClass_.retrieveChildrenREST.call(this, href, function () {
        if (spinner) {
          spinner.hide();
        }
        success.apply(this, arguments);
      }, function (response) {
        if (response.statusCode === 0 && response.type === 'net_error') {
          if (tries++ < 2) {
            return retrieveChildren_();
          }
        }

        if (spinner) {
          spinner.hide();
        }
        failure.apply(this, arguments);
      });
    })();
  };

  /**
   * Returns the ditamap url saved in the file browser.
   * @return {string}
   */
  GithubFileBrowser.prototype.getDitaMapUrl = function () {
    return this.ditamapUrl_;
  };

  /**
   * Extracts the root URL.
   *
   * @param {string} url the current url.
   * @private {string} the root url.
   */
  GithubFileBrowser.prototype.extractRootUrl_ = function(url) {
    if (url) {
      if (url.indexOf('getFileList') != -1) {
        return url.match('github://getFileList/[^/]+/[^/]+')[0];
      } else {
        return url.match('github://getFileContent/[^/]*/[^/]*/[^/]*/')[0];
      }
    }
  };

  /**
   * Cleanup from the previous editing state.
   */
  GithubFileBrowser.prototype.cleanupRepoEditing = function() {
    if (this.keyHandleBranchSelected) {
      goog.events.unlistenByKey(this.keyHandleBranchSelected);
    }
    if (this.repoChooser) {
      this.repoChooser.dispose();
    }
    this.renderedRepo = null;
    this.repoDetails = null;
  };

  /** @override */
  GithubFileBrowser.prototype.renderRepoPreview = function(element) {
    this.renderTitleBarLogoutButton(element);

    this.cleanupRepoEditing();
    var url = this.getCurrentFolderUrl();
    if (url) {
      element.title = tr(msgs.GIT_REPOSITORY_);
      goog.dom.classlist.add(element, 'vertical-align-children');
      goog.dom.classlist.add(element, 'github-browsing-repo-preview');

      if (url.match(/^github:\/\/getFileContent/)) {
        var details = url.match("github://getFileContent/([^/]*)/([^/]*)/([^/]*)/.*");

        element.innerHTML = '<span class="repo-icon"></span>' +
          details[1] + '/' + details[2] + '<span class="github-repo-right vertical-align-children"><span class="branch-icon"></span>' +
          decodeURIComponent(details[3]) + '</span>';
      } else {
        var matches = url.match('github://getFileList/([^/]+)/([^/]+)/?.*');
        var repoUri = matches[1];
        repoUri = decodeURIComponent(repoUri);
        var ownerAndRepo = repoUri.match('https?://[^/]+/([^/]+)/([^/]+).*');

        var branch = matches[2];

        element.innerHTML =
            '<span class="repo-icon"></span>' +
            ownerAndRepo[1] + '/' + ownerAndRepo[2] +
            '<span class="github-repo-right vertical-align-children">' +
              '<span class="branch-icon"></span>' + decodeURIComponent(branch) +
            '</span>';
      }

      var button = goog.dom.createDom('div', 'github-repo-edit');
      button.title = tr(msgs.EDIT_GIT_REPO_AND_BRANCH_);
      goog.dom.appendChild(element, button);
      goog.events.listen(button, goog.events.EventType.CLICK,
        goog.bind(this.switchToRepoConfig, this, element));
    }
  };

  /** @override */
  GithubFileBrowser.prototype.renderRepoEditing = function(element) {
    this.renderTitleBarLogoutButton(element);

    if (!this.gitAccess_) {
      goog.events.dispatchEvent(fileBrowser.getEventTarget(),
        new sync.api.FileBrowsingDialog.UserActionRequiredEvent(tr(msgs.GIT_CONFIG_BRANCH_URL_)));
      return;
    }

    goog.dom.classlist.removeAll(element, ['vertical-align-children', 'github-browsing-repo-preview']);

    element.innerHTML =
        '<div>' +
          '<div class="github-repo-ac">' +
            '<input autocapitalize="none" autocorrect="off" type="text" ' +
              'placeholder="' + tr(msgs.GIT_ENTER_REPO_URL_) + '">' +
          '</div>' +
          '<div class="github-repo-preview-area"></div>' +
        '</div>';

    var input = element.querySelector('.github-repo-ac > input');
    this.repoChooser = new GithubRepoChooser(this.gitAccess_, input, Object.keys(this.defaultRepos));
    var previewArea = element.querySelector('.github-repo-preview-area');
    goog.events.listen(this.repoChooser, 'github-repo-chosen',
      goog.bind(this.repositoryChosen_, this, previewArea));

    this.dialog.setPreferredSize(null, 300);
  };

  /**
   * Render an error message in the repo preview area.
   * @param {HTMLElement} preview The preview element.
   * @param {string} msg The message.
   * @private
   */
  GithubFileBrowser.prototype.repoChoosingMessage_ = function(preview, msg) {
    preview.innerHTML = '';
    goog.dom.appendChild(
        preview,
        goog.dom.createDom('div', 'github-repo-placeholder', msg)
    );
    this.renderedRepo = null;
  };

  /**
   * Callback when a repository was chosen - populate the repository preview are.
   *
   * @param {HTMLElement} preview The element where to show the repo details.
   * @param {goog.events.Event} e The event.
   * @private
   */
  GithubFileBrowser.prototype.repositoryChosen_ = function(preview, e) {
    var url = e.url;

    if (!url) {
      this.repoChoosingMessage_(preview, tr(msgs.NO_REPOSITORY_CHOSEN_));
      return;
    }

    this.repoDetails = null;
    var repoId = /^([a-zA-Z\-]+)\/([a-zA-Z\-]+)$/.exec(url);
    if (repoId) {
      this.repoDetails = {owner: repoId[1], repo: repoId[2]};
    } else {
      // Github and bitbucket share url structure so we can handle them and show more information to the user.

      var gitlabOrGithub = url.match(/^https?:\/\/(?:(?:gitlab\.com)|(?:(?:www\.)?(?:github\.com)))/);
      if (!gitlabOrGithub) {
        this.repoDetails = {repositoryUri: url};
      } else {
        var repoParts = /^https?:\/\/(?:(?:gitlab\.com)|(?:(?:www\.)?github\.com))\/([^\/]+)\/([^\/]+)(\/.*)?$/.exec(url);
        if (repoParts) {
          this.repoDetails = {host: gitlabOrGithub, owner: repoParts[1], repo: repoParts[2], rest: repoParts[3]};
        }
      }
    }
    if (this.repoDetails) {
      this.repoDetails.repositoryUri = e.repo || this.repoDetails.repositoryUri;
      if (this.renderedRepo != url) {
        this.renderedRepo = url;
        this.showRepoPreview(preview);

        // Adding the chosen url to the list of default url to show them when no other branches have been received.
        this.defaultRepos[url] = true;
      }
    } else {
      this.repoChoosingMessage_(preview,
          goog.dom.createDom('span', '',
              goog.dom.createDom('span', 'github-error-icon'),
              tr(msgs.FAILED_TO_OPEN_REPO_) + ': ' + e.url
          )
      );
    }
  };

  /**
   * Shows the repo preview and fetches the list of possible branches.
   *
   * @param {HTMLElement} preview
   */
  GithubFileBrowser.prototype.showRepoPreview = function(preview) {
    var html;
    var repositoryUri;

    if (this.repoDetails.repositoryUri) {
      repositoryUri = this.repoDetails.repositoryUri;

      var displayedRepoUri = repositoryUri;
      if (repositoryUri.indexOf('.git') === -1) {
        displayedRepoUri = repositoryUri + '.git';
      }

      html =
        '<div>' +
          '<div class="github-repo-section vertical-align-children"><span class="big-repo-icon"></span>' +
            '<span class="github-repo-name"><a target="_blank" href="' + displayedRepoUri + '">' + displayedRepoUri + '</a></span>' +
          '</div>' +
          '<div class="vertical-align-children"><span class="big-branch-icon"></span><select id="gh-settings-branch-select" tabindex="0"></select></div>' +
        '</div>';
    } else {
      var repoDesc = this.repoDetails.repoDescriptor;
      var owner = this.repoDetails.owner;
      var repoName = this.repoDetails.repo;

      repositoryUri = this.repoDetails.host + '/' + owner + '/' + repoName;

      var repoId = owner + '/' + repoName;

      // Compose the HTML used to render the repository.
      html = '<div>';
      html += '<div class="github-repo-section vertical-align-children">' +
        '<span class="big-repo-icon"></span>' +
        '<span class="github-repo-name">' +
          '<a target="_blank" tabindex="-1" href="' + this.repoDetails.host + '/' + owner + '">' + owner + '</a>' +
          '/' +
          '<a target="_blank" tabindex="-1" href="' + this.repoDetails.host + '/' + repoId + '">' + repoName + '</a>' +
        '</span>' +
        '</div>';
      html += '<div class="vertical-align-children"><span class="big-branch-icon"></span><select id="gh-settings-branch-select" tabindex="0"></select></div>';
      html += '<div class="vertical-align-children" style="display:none"><span class="github-file-icon"></span><span class="github-path"></span></div>';
      if (repoDesc && repoDesc.description) {
        html += '<div class="github-description-preview">' + repoDesc.description + '</div>';
      }
      if (repoDesc && repoDesc.language) {
        html += '<div>' + tr(msgs.LANGUAGE_) + ': ' + repoDesc.language + '</div>';
      }
      html += '</div>';
    }

    preview.innerHTML = html;


    var select = goog.dom.getElement('gh-settings-branch-select');
    var pathElem = preview.querySelector('.github-path');

    goog.dom.classlist.add(select, 'github-loading');

    // Maybe we already know the default branch.
    var defaultBranch = repoDesc && repoDesc.default_branch;
    if (this.branchesForUrl[repositoryUri]) {
      this.branchesReceived_(this.branchesForUrl[repositoryUri], select, pathElem, defaultBranch);
    } else {
      var self = this;
      var firstBatchReceived = false;

      this.gitAccess_().getBranches(repositoryUri, function gotBranches(err, branches) {
        if (err) {
          if (err.status === 401) {
            loginManager.setErrorMessage(err.message);
            loginManager.authenticateUser(goog.bind(function (gitAccess) {
              this.gitAccess_ = gitAccess;

              // Try again now that we are authenticated.
              this.gitAccess_().getBranches(repositoryUri, goog.bind(gotBranches, this));
            }, this), true);
          } else {
            self.repoDetails.error = tr(msgs.FAILED_TO_OPEN_REPO_);
            self.repoChoosingMessage_(preview,
                goog.dom.createDom('span', '',
                    goog.dom.createDom('span', 'github-error-icon'),
                    tr(msgs.FAILED_TO_OPEN_REPO_) + ': ' + repositoryUri
                )
            );
          }
        } else {
          if (!firstBatchReceived) {
            firstBatchReceived = true;

            if (!self.branchesForUrl[repositoryUri]) {
              self.branchesForUrl[repositoryUri] = [];
            }
            // cache the result no need to make the same request twice
            self.branchesForUrl[repositoryUri] = self.branchesForUrl[repositoryUri].concat(branches);
            self.branchesReceived_(self.branchesForUrl[repositoryUri], select, pathElem, defaultBranch);
          } else {
            self.branchesForUrl[repositoryUri] = self.branchesForUrl[repositoryUri].concat(branches);
            self.branchesContinued_(branches, select);
          }
        }
      });
    }
  };

  /**
   * The list of possible branches was received. We can now populate the combo and parse the branch vs. path from URL.
   *
   * We could not parse the URL before because the branch could contain '/' inside.
   *
   * @param {array<string>} branches The list of possible branches.
   * @param {HTMLElement} select The branches select combobox.
   * @param {HTMLElement} pathElem The element where the path will be displayed.
   * @param {string=} opt_defaultBranch The default branch if we know it beforehand.
   */
  GithubFileBrowser.prototype.branchesReceived_ = function (branches, select, pathElem, opt_defaultBranch) {
    goog.events.unlistenByKey(this.keyHandleBranchSelected);
    if (select) {
      goog.dom.removeChildren(select);
      for (var i = 0; i < branches.length; i++) {
        var option = goog.dom.createDom('option', {value: branches[i]}, branches[i]);
        select.appendChild(option);
      }

      // If the URL specifies a branch, or if we know the default branch, make sure to have it selected.
      var path_branch = null;
      if (this.repoDetails.rest) {
        var pathMatch = /\/([^\/]+)\/(.*)/.exec(this.repoDetails.rest);
        path_branch = pathMatch && pathMatch[2];
        if (path_branch) {
          // Parse the branch or commit number.
          var branchOrCommit = null;
          for (i = 0; i < branches.length; i++) {
            if (path_branch.indexOf(branches[i] + '/') == 0) {
              select.selectedIndex = i;
              branchOrCommit = branches[i];
              break;
            }
          }
          var details = /([^\/]+)(.*)/.exec(path_branch);
          if (details != null) {
            branchOrCommit = details[1];
          }

          if (branchOrCommit) {
            // Parse the file path and display it.
            this.repoDetails.isFile = pathMatch[1] == 'blob';
            this.repoDetails.branch = branchOrCommit;
            if (pathElem && path_branch.length > branchOrCommit.length) {
              var path = path_branch.substring(branchOrCommit.length + 1);
              this.repoDetails.path = path;
              pathElem.parentNode.style.display = 'block';
              pathElem.textContent = path;
            }
          }
        }
      }

      if (!this.repoDetails.branch) {
        // Try to select a default branch.
        var selectedIndex = -1;
        if (opt_defaultBranch) {
          selectedIndex = branches.indexOf(opt_defaultBranch);
        }
        if (selectedIndex == -1) {
          selectedIndex = branches.indexOf('master');
        }
        if (selectedIndex == -1) {
          selectedIndex = 0;
        }
        this.repoDetails.branch = branches[selectedIndex];
        select.selectedIndex = selectedIndex;
      } else {
        selectedIndex = branches.indexOf(this.repoDetails.branch);
        select.selectedIndex = selectedIndex;
      }

      goog.dom.classlist.remove(select, 'github-loading');
      if (this.keyHandleBranchSelected) {
        goog.events.unlistenByKey(this.keyHandleBranchSelected);
      }
      this.keyHandleBranchSelected = goog.events.listen(select, goog.events.EventType.CHANGE,
        goog.bind(this.handleBranchSelected, this));
    }
  };

  /**
   * Called to append to the list of branches the rest of them.
   * @private
   */
  GithubFileBrowser.prototype.branchesContinued_ = function (restOfBranches, select) {
    for (var i = 0; i < restOfBranches.length; i++) {
      var option = goog.dom.createDom('option', {value: restOfBranches[i]}, restOfBranches[i]);
      select.appendChild(option);
    }
  };

  /**
   * Called when a branch is selected to modify the repository url to include the selected branch.
   *
   * @param {goog.events.Event} event The triggering event
   */
  GithubFileBrowser.prototype.handleBranchSelected = function (event) {
    var select = event.target;
    this.repoDetails.branch = select.options[select.selectedIndex].text;
  };

  /** @override */
  GithubFileBrowser.prototype.handleOpenRepo = function(element, event) {
    var useJgit = !(this.gitAccess_() instanceof syncGit.SyncGithubApi);

    if (useJgit && this.repoDetails && this.repoDetails.branch) {
      var repositoryUri;

      if (this.repoDetails.repositoryUri) {
        repositoryUri = this.repoDetails.repositoryUri;
      } else {
        if (!this.repoDetails.repoDescriptor) {
          repositoryUri = this.repoDetails.host + '/' + this.repoDetails.owner + '/' + this.repoDetails.repo;
        } else {
          repositoryUri = this.repoDetails.repoDescriptor.html_url;
        }
      }

      var branchName = this.repoDetails.branch;
      var filePath = this.repoDetails.path ? this.repoDetails.path : '';

      var normalizedUrl =
        'github://getFileList/' +
        encodeURIComponent(repositoryUri) + '/' +
        encodeURIComponent(branchName) + '/' + filePath;

      try {
        localStorage.setItem(GIT_LATEST_URL_KEY, normalizedUrl);
      } catch (e) {}

      this.setRootUrl(this.extractRootUrl_(normalizedUrl));
      this.openUrl(normalizedUrl, this.repoDetails.isFile, event);
    } else if (!useJgit && this.repoDetails && this.repoDetails.owner && this.repoDetails.repo && this.repoDetails.branch) {
      var normalizedUrl = 'github://getFileContent/' + this.repoDetails.owner + '/' +
        this.repoDetails.repo + '/' + encodeURIComponent(this.repoDetails.branch) + '/';

      if (this.repoDetails.path) {
        // The user provided also a path.
        normalizedUrl = normalizedUrl + this.repoDetails.path;
      }

      try {
        localStorage.setItem(GIT_LATEST_URL_KEY, normalizedUrl);
      } catch (e) {}

      this.setRootUrl(this.extractRootUrl_(normalizedUrl));
      this.openUrl(normalizedUrl, this.repoDetails.isFile, event);
    } else {
      if (!this.repoDetails) {
        this.showErrorMessage(tr(msgs.NO_REPOSITORY_SELECTED_));
      } else if (this.repoDetails.error) {
        this.showErrorMessage(this.repoDetails.error);
      }
      event.preventDefault();
    }
  };

  /** @override */
  GithubFileBrowser.prototype.chooseUrl = function(context, chosen, purpose) {
    // Make sure the user is authenticated.

    var self = this;
    loginManager.authenticateUser(function (gitAccess) {
      fileBrowser.setGitAccess(gitAccess);

      GithubFileBrowser.superClass_.chooseUrl.call(self, context, function (value) {
        if (gitAccess() instanceof syncGit.SyncGithubApi) {
          chosen(fromListToContentUrl_(value));
        } else {
          chosen(fromContentToListUrl_(value));
        }
      }, purpose);
    });
  };

  /**
   * Renders the logout button on the dialog title bar.
   *
   * @param dialogChild a child of the dialog element from which
   * we can start the search for the title bar.
   * @param {boolean=} force Flag telling whether to force re-rendering of the logout button.
   */
  GithubFileBrowser.prototype.renderTitleBarLogoutButton = function(dialogChild, force) {
    if(!this.renderedLogoutButton && !sync.util.getURLParameter('url') || force) {
      var dialogTitleBar = (new goog.dom.DomHelper())
        .getAncestorByClass(dialogChild, 'modal-dialog');

      // Return early, The dialog is not rendered yet.
      if (!dialogTitleBar) {return;}

      var logoutContainer = dialogTitleBar.querySelector('.git-logout-container');
      if (!logoutContainer) {
        logoutContainer = goog.dom.createDom('div', 'git-logout-container');

        goog.events.listen(logoutContainer,
          goog.events.EventType.CLICK,
          function() {
            (new LogOutAction()).actionPerformed();
          },
          false,
          this);
      }
      logoutContainer.textContent = tr(msgs.LOGOUT_) + ' ';

      var usernameSpan = document.createElement('span');
      goog.dom.classlist.add(usernameSpan, 'git-username');

      try {
        var ghCredentials = JSON.parse(localStorage.getItem(GIT_CREDENTIALS_KEY));
      } catch (e) {}

      usernameSpan.textContent = ghCredentials && ghCredentials.username || '';
      logoutContainer.appendChild(usernameSpan);

      dialogTitleBar.appendChild(logoutContainer);

      // mark that the button has been rendered
      this.renderedLogoutButton = true;
    }
  };

  /**
   * A GithubFileBrowser which can be instantiated lazily.
   * @constructor
   */
  function LateGithubFileBrowser() {}
  goog.inherits(LateGithubFileBrowser, GithubFileBrowser);

  /**
   * Late instantiation of GithubFileBrowser.
   * @param {GitAccessProvider} gitAccess The git access provider.
   * @param {{initialUrl: string, ditaMapUrl: string}|null} customOpenProperties custom default opening props.
   */
  LateGithubFileBrowser.prototype.lateConstructor = function (gitAccess, customOpenProperties) {
    GithubFileBrowser.call(this, gitAccess, customOpenProperties);
  };

  // load the css by now because we will show a styled "Login with Github" button
  loadCss();

  /**
   * Register all the needed listeners on the file browser.
   *
   * @param {sync.api.FileBrowsingDialog} fileBrowser
   *  the file browser on which to listen.
   */
  var registerFileBrowserListeners = function (fileBrowser) {
    // handle the user action required event.
    var eventTarget = fileBrowser.getEventTarget();
    goog.events.listen(eventTarget,
      sync.api.FileBrowsingDialog.EventTypes.USER_ACTION_REQUIRED,
      function () {
        // Calling authenticate User with the reset flag set to true to make sure we request a new login flow.
        // We should only end up here if we are not authorized or if the logged in user has removed our application access from GitHub
        loginManager.authenticateUser(goog.bind(fileBrowser.refresh,fileBrowser), true);
      });
  };

  /**
   * This method is called before an Open or Create action to make sure the filebrowser is fully instantiated.
   * @private
   */
  function ensureDashboardFilebrowser_(gitAccess) {
    // Here filebrowser is a LateGithubFileBrowser;
    fileBrowser.lateConstructor(gitAccess, getCustomGithubProps(gitAccess));
    registerFileBrowserListeners(fileBrowser);

    // Need to late-construct only once.
    ensureDashboardFilebrowser_ = function () {};
  }

  /**
   * @type {sync.api.FileBrowsingDialog}
   */
  var fileBrowser;

  /**
   * The name of the action to call when this page is loaded again at the end of an oauth flow.
   * @type {string}
   */
  var callOnReturn = null;

  /** @override */
  function GithubOpenAction(filebrowser) {
    sync.actions.OpenAction.call(this, filebrowser);
  }
  goog.inherits(GithubOpenAction, sync.actions.OpenAction);

  /**
   * Opens the github file browsing dialog.
   */
  GithubOpenAction.prototype.actionPerformed = function () {
    // When an Oauth flow will finish the open action will be invoked
    callOnReturn = 'git.open';

    loginManager.authenticateUser(goog.bind(function (gitAccess) {
      ensureDashboardFilebrowser_(gitAccess);
      GithubOpenAction.superClass_.actionPerformed.call(this);
    }, this));
  };

  /** @override */
  GithubOpenAction.prototype.openFile = function (fileUrl) {
    if(fileUrl) {
      var newUrlParams = '?url=' + encodeURIComponent(fileUrl);

      var ditaMapUrl = /** @type {GithubFileBrowser} */ (this.urlChooser).getDitaMapUrl();
      if (ditaMapUrl) {
        newUrlParams += '&ditamap=' + encodeURIComponent(fromListToContentUrl_(ditaMapUrl));
      }

      // Creating a helperUrl to manipulate the query string more easily.
      var helperUrl = new goog.Uri('http://domain/path' + location.search);

      // Removing some parameters because url and ditamap will be set now.
      // The gh_ parameters are used once at the start of the dashboard
      // so we don't need to transfer them to the opened document.
      helperUrl.getQueryData().remove('url');
      helperUrl.getQueryData().remove('ditamap');
      helperUrl.getQueryData().remove('gh_repo');
      helperUrl.getQueryData().remove('gh_branch');
      helperUrl.getQueryData().remove('gh_ditamap');

      var otherParams = helperUrl.getQuery();

      if (otherParams) {
        newUrlParams += '&' + otherParams;
      }

      var openURL = location.pathname + newUrlParams;
      window.open(openURL);
    }
  };

  /**
   * Sets initialUrl and ditaMapUrl parameters which will be used when
   * showing the file-browser dialog and when opening a file.
   *
   * @param {{initialUrl: string, ditaMapUrl: string}} params
   *                           The properties with which to open the Open file dialog.
   */
  GithubOpenAction.prototype.setCustomOpenParams = function (params) {
    this.initialUrl = params.initialUrl;
    this.ditaMapUrl = params.ditaMapUrl;
  };

  /** @override */
  function GithubCreateDocumentAction() {
    sync.api.CreateDocumentAction.apply(this, arguments);
  }
  goog.inherits(GithubCreateDocumentAction, sync.api.CreateDocumentAction);

  GithubCreateDocumentAction.prototype.actionPerformed = function () {
    // When an Oauth flow will finish the create action will be invoked
    callOnReturn = 'git.create';
    // Make sure the user is authenticated.
    loginManager.authenticateUser(goog.bind(function (gitAccess) {
      ensureDashboardFilebrowser_(gitAccess);
      GithubCreateDocumentAction.superClass_.actionPerformed.call(this);
    }, this));
  };

  /**
   * @type {GithubOpenAction}
   */
  var githubOpenAction;

  /**
   * @type {GithubCreateDocumentAction}
   */
  var githubCreateAction;

  var isOnDashBoard = false;

  goog.events.listenOnce(workspace, sync.api.Workspace.EventType.BEFORE_DASHBOARD_LOADED, function (e) {
    isOnDashBoard = true;
    var useCustomOpeningProps = useCustomGithubProps();

    fileBrowser = new LateGithubFileBrowser();

    // Setting the hash so that the filebrowser will be opened in the DASHBOARD_LOADED event.
    if (useCustomOpeningProps) {
      location.hash = '#git.open';
    }

    var githubOauthEnabled = !!sync.options.PluginsOptions.getClientOption('github.client_id');

    githubOpenAction = new GithubOpenAction(fileBrowser);
    if (githubOauthEnabled) {
      githubOpenAction.setLargeIcon(sync.util.computeHdpiIcon('../plugin-resources/github-static/Github70.png'));
    } else {
      githubOpenAction.setLargeIcon(sync.util.computeHdpiIcon('../plugin-resources/github-static/Git-logo70.png'));
    }
    githubOpenAction.setDescription(tr(msgs.OPEN_DOCUMENT_FROM_GIT_));
    githubOpenAction.setActionId('git-open-action');
    githubOpenAction.setActionName("Git");

    githubCreateAction = new GithubCreateDocumentAction(fileBrowser);
    if (githubOauthEnabled) {
      githubCreateAction.setLargeIcon(sync.util.computeHdpiIcon('../plugin-resources/github-static/Github70.png'));
    } else {
      githubCreateAction.setLargeIcon(sync.util.computeHdpiIcon('../plugin-resources/github-static/Git-logo70.png'));
    }
    githubCreateAction.setDescription(tr(msgs.CREATE_FILE_ON_GIT_));
    githubCreateAction.setActionId('git-create-action');
    githubCreateAction.setActionName('Git');

    workspace.getActionsManager().registerOpenAction(
      githubOpenAction);
    workspace.getActionsManager().registerCreateAction(
      githubCreateAction);
  });

  // Invoke the callOnReturn action if one was set
  goog.events.listenOnce(workspace, sync.api.Workspace.EventType.DASHBOARD_LOADED, function (e) {
    switch (location.hash) {
    case '#git.open':
      setTimeout(function () {
        githubOpenAction.actionPerformed();
      }, 0);

      // Remove the fragment part of the url because users may want tot copy the url to give to someone else
      location.hash = '';
      break;
    case '#git.create':
      setTimeout(function () {
        githubCreateAction.actionPerformed();
      });

      // Remove the fragment part of the url because users may want tot copy the url to give to someone else
      location.hash = '';
      break;
    }
  });

  /**
   * @return {boolean} <code>true</code> if the url contains custom github opening properties.
   */
  function useCustomGithubProps() {
    var urlParams = sync.util.getApiParams();
    return !!urlParams.gh_repo;
  }

  /**
   * When the gh_repo, gh_branch and gh_ditamap parameters are passed in the url we will open the filebrowser
   * directly at the gh_repo/gh_branch location.
   *
   * @param {GitAccessProvider} gitAccess Needed to know the authentication method.
   * @return {{initialUrl: string, ditaMapUrl: string}|null}
   */
  function getCustomGithubProps(gitAccess) {
    var urlParams = sync.util.getApiParams();
    if (urlParams.gh_repo) {

      var ghRepo = urlParams.gh_repo;                  // :user/:repo
      var ghBranch = urlParams.gh_branch || 'master';  // :branch
      var ghDitamap = urlParams.gh_ditamap;            // :path/to/file

      var initialUrl;

      var repositoryUrl = 'https://github.com/' + ghRepo;

      if (gitAccess() instanceof syncGit.SyncGithubApi) {
        initialUrl =
          'github://getFileContent/' +
          ghRepo + '/' +
          encodeURIComponent(ghBranch) + '/';
      } else {
        initialUrl =
          'github://getFileList/' +
          encodeURIComponent(repositoryUrl) + '/' +
          encodeURIComponent(ghBranch) + '/';
      }

      // build the initialUrl github://getFileContent/:user/:repository/:branch/:path_to_ditamap
      var ditaMapUrl = (ghDitamap ? initialUrl + ghDitamap : null);

      return {
        initialUrl: initialUrl,
        ditaMapUrl: ditaMapUrl
      };
    } else {
      return null;
    }
  }

}());
