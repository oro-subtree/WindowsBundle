var Oro = Oro || {};
Oro.widget = Oro.widget || {};

Oro.widget.DialogView = Oro.widget.Abstract.extend({
    options: _.extend(
        _.extend({}, Oro.widget.Abstract.prototype.options),
        {
            type: 'dialog',
            dialogOptions: null,
            stateEnabled: true,
            incrementalPosition: true
        }
    ),

    // Windows manager global variables
    windowsPerRow: 10,
    windowOffsetX: 15,
    windowOffsetY: 15,
    windowX: 0,
    windowY: 0,
    defaultPos: 'center center',
    openedWindows: 0,

    /**
     * Initialize dialog
     */
    initialize: function(options) {
        options = options || {}
        this.initializeWidget(options);

        this.on('adoptedFormResetClick', _.bind(this.remove, this));

        this.options.dialogOptions = this.options.dialogOptions || {};
        this.options.dialogOptions.title = this.options.dialogOptions.title || this.options.title;
        this.options.dialogOptions.limitTo = this.options.dialogOptions.limitTo || '#container';

        this._initModel(this.options);

        var runner = function(handlers) {
            return function() {
                for (var i = 0; i < handlers.length; i++) {
                    if (_.isFunction(handlers[i])) {
                        handlers[i]();
                    }
                }
            }
        };

        var closeHandlers = [_.bind(this.closeHandler, this)];
        if (this.options.dialogOptions.close !== undefined) {
            closeHandlers.push(this.options.dialogOptions.close);
        }

        this.options.dialogOptions.close = runner(closeHandlers);

        this.on('contentLoadError', _.bind(this.loadErrorHandler, this));
    },

    setTitle: function(title) {
        this.widget.dialog("option", "title", title);
    },

    _initModel: function(options) {
        if (this.options.stateEnabled && this.model) {
            this.restoreMode = true;
            var attributes = this.model.get('data');
            _.extend(options, attributes);
            if (_.isObject(attributes.dialogOptions)) {
                options.dialogOptions = _.extend(options.dialogOptions, attributes.dialogOptions);
            }
            this.options = options;
            if (this.options.el) {
                this.setElement(this.options.el);
            } else if (this.model.get('id')) {
                var restoredEl = Backbone.$('#widget-restored-state-' + this.model.get('id'));
                if (restoredEl.length) {
                    this.setElement(restoredEl);
                }
            }
        } else {
            this.model = new Oro.widget.StateModel();
        }
    },

    /**
     * Handle dialog close
     */
    closeHandler: function() {
        this.model.destroy({
            error: _.bind(function(model, xhr, options) {
                // Suppress error if it's 404 response and not debug mode
                if (xhr.status != 404 || Oro.debug) {
                    Oro.BackboneError.Dispatch(model, xhr, options);
                }
            }, this)
        });
        this.widget.remove();
        Oro.widget.Abstract.prototype.remove.call(this);
    },

    handleStateChange: function(e, data) {
        if (!this.options.stateEnabled) {
            return;
        }
        if (this.restoreMode) {
            this.restoreMode = false;
            return;
        }
        var saveData = _.omit(this.options, ['dialogOptions', 'el', 'model']);
        if (!saveData.url) {
            saveData.el = Backbone.$('<div/>').append(this.$el.clone()).html();
        }
        saveData.dialogOptions = {};
        _.each(this.options.dialogOptions, function(val, key) {
            if (!_.isFunction(val) && key != 'position') {
                saveData.dialogOptions[key] = val;
            }
        }, this);

        saveData.dialogOptions.title = Backbone.$(e.target).dialog('option', 'title');
        saveData.dialogOptions.state = data.state;
        saveData.dialogOptions.snapshot = data.snapshot;

        this.model.save({data: saveData});
    },

    remove: function() {
        // Close will trigger call of closeHandler where Backbone.View.remove will be called
        this.widget.dialog('close');
    },

    getWidget: function() {
        return this.widget;
    },

    loadErrorHandler: function()
    {
        this.model.destroy();
    },

    getActionsElement: function() {
        if (!this.actionsEl) {
            this.actionsEl = Backbone.$('<div class="pull-right"/>').appendTo(
                Backbone.$('<div class="form-actions widget-actions"/>').appendTo(
                    this.widget.dialog('actionsContainer')
                )
            );
        }
        return this.actionsEl;
    },

    _clearActionsContainer: function() {
        this.widget.dialog('actionsContainer').empty();
    },

    _renderActions: function() {
        Oro.widget.Abstract.prototype._renderActions.apply(this);
        this.widget.dialog('showActionsContainer');
    },

    /**
     * Show dialog
     */
    show: function() {
        if (!this.widget) {
            if (typeof this.options.dialogOptions.position == 'undefined') {
                this.options.dialogOptions.position = this._getWindowPlacement();
            }
            this.options.dialogOptions.stateChange = _.bind(this.handleStateChange, this);
            this.widget = Backbone.$('<div/>').append(this.$el).dialog(this.options.dialogOptions);
        } else {
            this.widget.html(this.dialogContent);
        }

        this.adoptActions();
        this.adjustHeight();

        // Processing links in dialog
        if (!_.isUndefined(Oro.hashNavigationInstance) && Oro.hashNavigationEnabled()) {
            Oro.hashNavigationInstance.processClicks($(this.dialogContent).find(Oro.hashNavigationInstance.selectors.links));
        }
    },

    adjustHeight: function() {
        var content = this.widget.find('.scrollable-container');
        if (content.length == 0) {
            return;
        }

        // first execute
        if (_.isNull(this.contentTop)) {
            content.css('overflow', 'auto');

            var parentEl = content.parent();
            var topPaddingOffset = parentEl.is(this.widget)?0:parentEl.position().top;
            this.contentTop = content.position().top + topPaddingOffset;
            var widgetHeight = this.widget.height();
            content.outerHeight(this.widget.height() - this.contentTop);
            if (widgetHeight != this.widget.height()) {
                // there is some unpredictable offset
                this.contentTop += this.widget.height() - this.contentTop - content.outerHeight();
                content.outerHeight(this.widget.height() - this.contentTop);
            }
            this.widget.on("dialogresize", _.bind(this.adjustHeight, this));
        }
        Oro.widget.Abstract.prototype.show.apply(this);
    },

    /**
     * Get next window position based
     *
     * @returns {{my: string, at: string, of: (*|jQuery|HTMLElement), within: (*|jQuery|HTMLElement)}}
     * @private
     */
    _getWindowPlacement: function() {
        if (!this.options.incrementalPosition) {
            return {
                my: 'center center',
                at: Oro.widget.DialogView.prototype.defaultPos
            };
        }
        var offset = 'center+' + Oro.widget.DialogView.prototype.windowX + ' center+' + Oro.widget.DialogView.prototype.windowY;

        Oro.widget.DialogView.prototype.openedWindows++;
        if (Oro.widget.DialogView.prototype.openedWindows % Oro.widget.DialogView.prototype.windowsPerRow === 0) {
            var rowNum = Oro.widget.DialogView.prototype.openedWindows / Oro.widget.DialogView.prototype.windowsPerRow;
            Oro.widget.DialogView.prototype.windowX = rowNum * Oro.widget.DialogView.prototype.windowsPerRow * Oro.widget.DialogView.prototype.windowOffsetX;
            Oro.widget.DialogView.prototype.windowY = 0;

        } else {
            Oro.widget.DialogView.prototype.windowX += Oro.widget.DialogView.prototype.windowOffsetX;
            Oro.widget.DialogView.prototype.windowY += Oro.widget.DialogView.prototype.windowOffsetY;
        }

        return {
            my: offset,
            at: Oro.widget.DialogView.prototype.defaultPos
        };
    }
});

Oro.widget.Manager.registerWidgetContainer('dialog', Oro.widget.DialogView);
