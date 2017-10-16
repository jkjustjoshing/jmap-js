// -------------------------------------------------------------------------- \\
// File: Message.js                                                           \\
// Module: MailModel                                                          \\
// Requires: API, Mailbox.js                                                  \\
// -------------------------------------------------------------------------- \\

/*global O, JMAP */

'use strict';

( function ( JMAP, undefined ) {

const clone = O.clone;
const Status = O.Status;
const EMPTY = Status.EMPTY;
const READY = Status.READY;
const LOADING = Status.LOADING;
const NEW = Status.NEW;
const Record = O.Record;
const attr = Record.attr;

// ---

const keywordProperty = function ( keyword ) {
    return function ( value ) {
        if ( value !== undefined ) {
            this.setKeyword( keyword, value );
        } else {
            value = this.get( 'keywords' )[ keyword ];
        }
        return !!value;
    }.property( 'keywords' );
};

const MessageDetails = O.Class({ Extends: Record });

const Message = O.Class({

    Extends: Record,

    threadId: attr( String, {
        noSync: true,
    }),

    thread: function () {
        var threadId = this.get( 'threadId' );
        return threadId ?
            this.get( 'store' ).getRecord( JMAP.Thread, threadId ) : null;
    }.property( 'threadId' ).nocache(),

    mailboxes: Record.toMany({
        recordType: JMAP.Mailbox,
        key: 'mailboxIds',
        Type: Object,
    }),

    keywords: attr( Object, {
        defaultValue: {}
    }),

    hasAttachment: attr( Boolean ),

    from: attr( Array ),
    to: attr( Array ),
    subject: attr( String ),
    date: attr( Date, {
        toJSON: Date.toUTCJSON
    }),

    size: attr( Number ),

    preview: attr( String ),

    // ---

    isIn: function ( role ) {
        return this.get( 'mailboxes' ).some( function ( mailbox ) {
            return mailbox.get( 'role' ) === role;
        });
    },

    isInTrash: function () {
        return this.isIn( 'trash' );
    }.property( 'mailboxes' ),

    isInNotTrash: function () {
        return !this.get( 'isInTrash' ) ||
            ( this.get( 'mailboxes' ).get( 'length' ) > 1 );
    }.property( 'mailboxes' ),

    notifyThread: function () {
        var threadId = this.get( 'threadId' );
        var store = this.get( 'store' );
        if ( threadId &&
                ( store.getRecordStatus( JMAP.Thread, threadId ) & READY ) ) {
            this.get( 'thread' ).propertyDidChange( 'messages' );
        }
    }.queue( 'before' ).observes( 'mailboxes', 'keywords', 'hasAttachment' ),

    // ---

    isUnread: function ( value ) {
        if ( value !== undefined ) {
            this.setKeyword( '$Seen', !value );
        } else {
            value = !this.get( 'keywords' ).$Seen;
        }
        return value;
    }.property( 'keywords' ),

    isDraft: keywordProperty( '$Draft' ),
    isFlagged: keywordProperty( '$Flagged' ),
    isAnswered: keywordProperty( '$Answered' ),
    isForwarded: keywordProperty( '$Forwarded' ),
    isPhishing: keywordProperty( '$Phishing' ),

    setKeyword: function ( keyword, value ) {
        var keywords = clone( this.get( 'keywords' ) );
        if ( value ) {
            keywords[ keyword ] = true;
        } else {
            delete keywords[ keyword ];
        }
        return this.set( 'keywords', keywords );
    },

    // ---

    fromName: function () {
        var from = this.get( 'from' );
        var emailer = from && from [0] || null;
        return emailer ? emailer.name || emailer.email.split( '@' )[0] : '';
    }.property( 'from' ),

    fromEmail: function () {
        var from = this.get( 'from' );
        var emailer = from && from [0] || null;
        return emailer ? emailer.email : '';
    }.property( 'from' ),

    // ---

    fullDate: function () {
        var date = this.get( 'date' );
        return O.i18n.date( date, 'fullDateAndTime' );
    }.property( 'date' ),

    relativeDate: function () {
        var date = this.get( 'date' ),
            now = new Date();
        // As the server clock may not be exactly in sync with the client's
        // clock, it's possible to get a message which appears to be dated a
        // few seconds into the future! Make sure we always display this as
        // a few minutes ago instead.
        return date < now ?
            date.relativeTo( now, true ) :
            now.relativeTo( date, true );
    }.property().nocache(),

    formattedSize: function () {
        return O.i18n.fileSize( this.get( 'size' ), 1 );
    }.property( 'size' ),

    // ---

    detailsStatus: function ( status ) {
        if ( status !== undefined ) {
            return status;
        }
        if ( this.get( 'blobId' ) || this.is( NEW ) ) {
            return READY;
        }
        return EMPTY;
    }.property( 'blobId' ),

    fetchDetails: function () {
        if ( this.get( 'detailsStatus' ) === EMPTY ) {
            JMAP.mail.fetchRecord( MessageDetails, this.get( 'id' ) );
            this.set( 'detailsStatus', EMPTY|LOADING );
        }
    },

    blobId: attr( String ),

    headers: attr( Object, {
        defaultValue: {}
    }),

    sender: attr( Object ),
    cc: attr( Array ),
    bcc: attr( Array ),
    replyTo: attr( Array ),

    textBody: attr( String ),
    htmlBody: attr( String ),

    attachments: attr( Array ),
    attachedMessages: attr( Object )
});

Message.headerProperties = [
    'threadId',
    'mailboxIds',
    'keywords',
    'hasAttachment',
    'from',
    'to',
    'subject',
    'date',
    'size',
    'preview'
];
Message.detailsProperties = [
    'blobId',
    'headers.message-id',
    'headers.in-reply-to',
    'headers.references',
    'headers.list-id',
    'headers.list-post',
    'sender',
    'cc',
    'bcc',
    'replyTo',
    'body',
    'attachments',
    'attachedMessages'
];
Message.Details = MessageDetails;

JMAP.mail.handle( MessageDetails, {
    fetch: function ( ids ) {
        this.callMethod( 'getMessages', {
            ids: ids,
            properties: Message.detailsProperties
        });
    }
});

JMAP.mail.messageUpdateFetchRecords = true;
JMAP.mail.messageUpdateMaxChanges = 50;
JMAP.mail.handle( Message, {
    precedence: 1,

    fetch: function ( ids ) {
        this.callMethod( 'getMessages', {
            ids: ids,
            properties: Message.headerProperties
        });
    },

    refresh: function ( ids, state ) {
        if ( ids ) {
            this.callMethod( 'getMessages', {
                ids: ids,
                properties: [
                    'mailboxIds',
                    'keywords'
                ]
            });
        } else {
            var messageUpdateFetchRecords = this.messageUpdateFetchRecords;
            this.callMethod( 'getMessageUpdates', {
                sinceState: state,
                maxChanges: this.messageUpdateMaxChanges,
                fetchRecords: messageUpdateFetchRecords,
                fetchRecordProperties: messageUpdateFetchRecords ?
                    Message.headerProperties : null
            });
        }
    },

    commit: 'setMessages',

    // ---

    messages: function ( args ) {
        var store = this.get( 'store' );
        var list = args.list;
        var updates, l, message, data, headers;

        // Merge with any previous fetched headers. This is safe, because
        // the headers are immutable.
        l = list.length;
        while ( l-- ) {
            message = list[l];
            if ( message.headers ) {
                data = store.getData(
                    store.getStoreKey( Message, message.id )
                );
                headers = data && data.headers;
                if ( headers ) {
                    Object.assign( message.headers, headers );
                }
            }
        }

        if ( !message || message.date ) {
            this.didFetch( Message, args );
        } else {
            updates = args.list.reduce( function ( updates, message ) {
                updates[ message.id ] = message;
                return updates;
            }, {} );
            store.sourceDidFetchPartialRecords( Message, updates );
        }
    },
    messageUpdates: function ( args, _, reqArgs ) {
        this.didFetchUpdates( Message, args, reqArgs );
        if ( !reqArgs.fetchRecords ) {
            this.recalculateAllFetchedWindows();
        }
        if ( args.hasMoreUpdates ) {
            var messageUpdateMaxChanges = this.messageUpdateMaxChanges;
            if ( messageUpdateMaxChanges < 150 ) {
                if ( messageUpdateMaxChanges === 50 ) {
                    // Keep fetching updates, just without records
                    this.messageUpdateFetchRecords = false;
                    this.messageUpdateMaxChanges = 100;
                } else {
                    this.messageUpdateMaxChanges = 150;
                }
                this.get( 'store' ).fetchAll( Message, true );
                return;
            } else {
                // We've fetched 300 updates and there's still more. Let's give
                // up and reset.
                this.response
                    .error_getMessageUpdates_cannotCalculateChanges
                    .call( this, args );
            }
        }
        this.messageUpdateFetchRecords = true;
        this.messageUpdateMaxChanges = 50;
    },
    error_getMessageUpdates_cannotCalculateChanges: function ( /* args */ ) {
        var store = this.get( 'store' );
        // All our data may be wrong. Mark all messages as obsolete.
        // The garbage collector will eventually clean up any messages that
        // no longer exist
        store.getAll( Message ).forEach( function ( message ) {
            message.setObsolete();
        });
        this.recalculateAllFetchedWindows();
        // Tell the store we're now in the new state.
        store.sourceDidFetchUpdates(
            Message, null, null, store.getTypeState( Message ), '' );

    },
    messagesSet: function ( args ) {
        this.didCommit( Message, args );
    }
});

JMAP.Message = Message;

}( JMAP ) );
