'use strict';
/* global firebaseRef, moment, userId */
(function() {

    var init = function init() {
        var imOnline = firebaseRef.child('users').child(userId).child('online');
        imOnline.set(true);
        imOnline.onDisconnect().set(false);

        firebaseRef.child('users').on('value', function(snapshot) {
            var users = snapshot.val();
            Object.keys(users).forEach(function(user) {
                if(users.hasOwnProperty(user)) {
                    if(users[user].online){
                        $('[data-standup-user-id=' + user + '] .online-status').removeClass('hide');
                    } else {
                        $('[data-standup-user-id=' + user + '] .online-status').addClass('hide');
                    }
                }
            });
        });

        moveToSwimlanes();

        $('.issue-col').each(function() {
            this.addEventListener('drop', onDrop);
            this.addEventListener('dragover', function(){return false;});
        });
        $('.issue').each(function() {
            this.addEventListener('dragstart', startDrag);
        });

        configFilterOptions();

        firebaseRef.child('issues').on('child_changed', updateIssues);
        firebaseRef.child('issues').on('child_added', updateIssues);
        firebaseRef.child('standup').on('value', updateStandup);
    };

    var moveToSwimlanes = function moveToSwimlanes() {
        var assignees = [];
        $('.issue').each(function() {
            var assignee = $(this).data('username');
            if(assignee !== 'Unassigned' && assignees.indexOf(assignee) < 0) {
                assignees.push(assignee);
            }
        });
        assignees = assignees.sort();
        assignees.forEach(function(assignee) {
            var html = Handlebars.templates.swimlane({assignee:assignee, avatar:$('[data-username=' + assignee + '] .avatar').attr('src')});
            $('.swimlanes').append(html);
        });
        $('.issue').each(function() {
            var column = $('.swimlane[data-assignee=' + $(this).data('username') + ']').find('[data-column=' + $(this).closest('.issue-col').data('column') + ']');
            $(this).remove().appendTo(column);
        });
    };

    var resizeColumns = function resizeColumns() {
        $('.swimlane').each(function() {
            var colHeight =  -1;
            $(this).find('.issue-col').each(function() {
                $(this).height('initial');
                var h = $(this).height();
                colHeight = h > colHeight ? h : colHeight;
            });
            $(this).find('.issue-col').height(colHeight);
        });
    };

    var startDrag = function startDrag(e) {
        e.dataTransfer.setData('text/plain', this.id);
    };

    var onDrop = function onDrop(e) {
        var $issue = $('#' + e.dataTransfer.getData('text/plain'));
        var $newCol = $(e.target).closest('.issue-col');
        firebaseRef.child('issues').child($issue.attr('id')).update({
            id: $issue.attr('id'),
            column: $newCol.data('column'),
            assignee: $issue.data('username')
        });
	   e.preventDefault();
    };

    var updateIssues = function updateIssues(snapshot) {
        var $issue = $('#' + snapshot.val().id);
        var column = $('.swimlane[data-assignee=' + snapshot.val().assignee + ']').find('[data-column=' + snapshot.val().column + ']');
        $issue.remove().appendTo(column);
        $('.progress').remove();
        resizeColumns();
    };

    var filterIssues = function filterIssues() {
        function getParentText(self) {
            return $(self).parent().text().trim();
        }
        $('.issue').removeClass('hide');
        $('.swimlane').removeClass('hide');
        $('.js-githubuser').not(':checked').each(function() {
            $('.issue[data-username="' + getParentText(this) + '"]').addClass('hide');
            $('.swimlane[data-assignee="' + getParentText(this) + '"]').addClass('hide');
        });
        $('.js-label').not(':checked').each(function() {
            $('.issue[data-label*="' + getParentText(this) + '"]').addClass('hide');
        });
        $('.js-repo').not(':checked').each(function() {
            $('.issue[data-repo="' + getParentText(this) + '"]').addClass('hide');
        });
        $('.js-state').not(':checked').each(function() {
            $('.issue[data-state="' + getParentText(this) + '"]').addClass('hide');
        });
        $('.issue').each(function() {
            var lastUpdated = $(this).data('updated');
            var weeks = $('#dateRange').val();
            if (moment(lastUpdated).isBefore(moment().subtract(weeks, 'weeks'))) {
                $(this).addClass('hide');
            }
        });

        $('#filterModal').modal('hide');
        resizeColumns();
    };

    var configFilterOptions = function configFilterOptions() {
        var saveFilter = function saveFilter() {
            var formInputs = document.getElementById('filterForm').elements;
            var i = 0;
            var len = formInputs.length;
            var formValues = {};
            var inputId;
            for (; i < len; i++) {
                inputId = formInputs[i].id.replace(/\./g, '&46;');
                if (formInputs[i].type === 'checkbox') {
                    formValues[inputId] = formInputs[i].checked;
                } else {
                    formValues[inputId] = formInputs[i].value;
                }
            }
            firebaseRef.child('users').child(userId).child('filter').update(formValues);

            filterIssues();
        };
        var loadFilter = function saveFilter() {
            var filters = firebaseRef.child('users').child(userId);
            filters.child('filter').once('value', function(snapshot) {
                var formValues = snapshot.val();
                var inputElement;
                if (formValues) {
                    Object.keys(formValues).forEach(function(key) {
                        if (formValues.hasOwnProperty(key)) {
                            inputElement = document.getElementById(key.replace(/&46;/g, '.'));
                            if (inputElement) {
                                if (inputElement.type === 'checkbox') {
                                    inputElement.checked = formValues[key];
                                } else {
                                    inputElement.value = formValues[key];
                                }
                            }
                        }
                    });
                }
                filterIssues();
            });
        };
        var toggleAll = function toggleAll(e) {
            var formInputs = $(this).parent().next().find('input');
            if (formInputs.not(':checked').length) {
                formInputs.each(function() {
                    this.checked = true;
                });
            } else {
                formInputs.each(function() {
                    this.checked = false;
                });
            }

            e.preventDefault();
        };

        $('#saveFilterButton').on('click', saveFilter);
        $('[data-action="toggleAll"]').unbind('click').on('click', toggleAll);
        loadFilter();
    };

    var standupMode = function standupMode() {
        var endStandup = function endStandup() {
            firebaseRef.child('standup').remove();
        };
        var selectUser = function selectUser() {
            var username = $(this).data('standup-user');
            firebaseRef.child('standup').update({
                username: username
            });
        };
        $('[data-standup-user]').unbind('click').on('click', selectUser);
        $('.js-endStandup').unbind('click').on('click', endStandup);
    };

    var updateStandup = function updateStandup(snapshot) {
        if (snapshot.val()) {
            var username = snapshot.val().username;
            $('.swimlane').addClass('hide');
            $('.swimlane[data-assignee=' + username + ']').removeClass('hide');
        } else {
            $('.swimlane').removeClass('hide');
            $('#standupBtn').text('Start Stand-up');
            configFilterOptions();
        }

        $('#standupModal').modal('hide');
    };

    if (document.location.pathname.indexOf('kanban') >= 0) {
        $('#standupBtn').on('click', standupMode);
        $(document).on('firebase-ready', init);
        resizeColumns();
    }
}());
