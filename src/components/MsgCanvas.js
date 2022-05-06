import React, { Component } from 'react';
import styled from 'styled-components';

import MsgContactList from './MsgContactList';
import MsgContactAdd from './MsgContactAdd';
import MsgList from './MsgList';
import MsgComposer from './MsgComposer';
import Spinner from './Spinner';
import MsgContactHeader from './MsgContactHeader';

const msgsPerPage = 30;

export default class CanvasMsg extends Component {
  constructor(props) {
    super(props);
    this.msgAddedHandlerTracker = {};
    this.fetchTracker = {};
    this.state = {
      selectedContact: null,
      newPhoneNumber: ''
    };
  }

  selectContact = (selectedContact) => {
    this.setState({ selectedContact });
    if (selectedContact !== null) {
      this.fetchMsgsForContact(selectedContact); // async fetch data for selected contact
      this.props.client
        .getChannelByUniqueName(selectedContact)
        .then((channel) => {
          // mark all messages as read
          channel.setAllMessagesConsumed().then(() => {
            // when done, update cache as well
            this.props.setUnreadsCache(selectedContact, 0);
          });
        });
    }
  };

  deleteThread = (contact) => {
    this.props.client.getChannelByUniqueName(contact).then((channel) => {
      // mark all messages as read
      channel.delete();
      this.fetchTracker[contact] = false;
      delete this.msgAddedHandlerTracker[contact];
    });
  };

  fetchAnotherPage = () => {
    return new Promise((resolve, reject) => {
      const contact = this.state.selectedContact;
      if (contact === 'new') {
        return;
      }
      const paginator = this.props.msgPgtrCache[contact];
      if (!paginator.hasPrevPage) {
        reject('No more messages.');
      } else {
        paginator.prevPage().then((paginator) => {
          let messages = [];
          paginator.items.forEach((msg) => {
            messages.push(msg);
          });
          this.props.addMsgCachePage(contact, messages, paginator);
          resolve();
        });
      }
    });
  };

  componentDidMount() {
    if (this.props.channelList) {
      Object.keys(this.props.channelList).forEach((contact) => {
        this.fetchMsgsForContact(contact);
      });
    }
  }

  componentDidUpdate() {
    if (this.props.channelList) {
      Object.keys(this.props.channelList).forEach((contact) => {
        this.fetchMsgsForContact(contact);
      });
    }
  }

  componentWillUnmount() {
    // remove all 'messageAdded' event listeners
    Object.keys(this.msgAddedHandlerTracker).forEach((contact) => {
      this.props.client.getChannelByUniqueName(contact).then((channel) => {
        channel.removeAllListeners('messageAdded');
      });
    });
  }

  msgAddedHandler = (contact, msg) => {
    this.props.addMsgCacheMsg(contact, msg);
    if (
      // if we're the originator of the message, it means we've read it
      // (this ensures messages originating from this client don't count as unread)
      msg.state.author === 'us' ||
      // or same thing if user has the thread the message belongs to currently opened
      contact === this.state.selectedContact
    ) {
      this.props.channelList[contact]
        .updateLastConsumedMessageIndex(msg.state.index)
        .then(() => {
          this.props.setUnreadMsgs(this.props.channelList[contact], contact);
        });
    } else {
      this.props.setUnreadMsgs(this.props.channelList[contact], contact);
    }
  };

  fetchMsgsForContact = (contact) => {
    if (contact === 'new') {
      return;
    }
    if (
      this.props.msgCache[contact] === undefined &&
      !this.fetchTracker[contact]
    ) {
      this.fetchTracker[contact] = true; // prevent double-fetching
      this.props.client.getChannelByUniqueName(contact).then((channel) => {
        // first fetch existing messages
        channel.getMessages(msgsPerPage).then((paginator) => {
          let messages = [];
          paginator.items.forEach((msg) => {
            messages.push(msg);
          });
          this.props.setMsgCachePage(contact, messages, paginator);
          this.props.setUnreadMsgs(channel, contact);
        });
        // then subscribe for receiving new messages
        if (!this.msgAddedHandlerTracker[contact]) {
          this.msgAddedHandlerTracker[contact] = true;
          channel.on('messageAdded', this.msgAddedHandler.bind(null, contact));
        }
      });
    }
  };

  updateNewPhoneNumber = (e) => {
    if (e && e.target) {
      this.setState({ newPhoneNumber: e.target.value });
    } else if (e === '') {
      // for resets after sending message in MsgComposer
      this.setState({ newPhoneNumber: '' });
    }
  };

  render() {
    if (this.state.selectedContact) {
      return (
        <Canvas>
          <MsgContactHeader
            key="msgContactHeader"
            back={this.selectContact.bind(null, null)}
            selectedContact={this.state.selectedContact}
            newPhoneNumber={this.state.newPhoneNumber}
            updateNewPhoneNumber={this.updateNewPhoneNumber}
          />
          <MsgList
            key="msgList"
            messages={this.props.msgCache[this.state.selectedContact]}
            fetchAnotherPage={this.fetchAnotherPage}
            selectedContact={this.state.selectedContact}
          />
          <MsgComposer
            key="msgComposer"
            secret={this.props.secret}
            selectedContact={this.state.selectedContact}
            selectContact={this.selectContact}
            newPhoneNumber={this.state.newPhoneNumber}
            updateNewPhoneNumber={this.updateNewPhoneNumber}
          />
        </Canvas>
      );
    } else {
      if (this.props.channelList === null) {
        return (
          <Canvas>
            <Spinner text="Loading..." />
          </Canvas>
        );
      } else {
        return (
          <Canvas>
            <MsgContactAdd
              key="msgContactAdd"
              selectContact={this.selectContact}
            />
            <MsgContactList
              key="msgContactList"
              msgUnreadsCache={this.props.msgUnreadsCache}
              client={this.props.client}
              channelList={this.props.channelList}
              selectContact={this.selectContact}
              deleteThread={this.deleteThread}
              msgCache={this.props.msgCache}
              unreadsCache={this.props.unreadsCache}
            />
          </Canvas>
        );
      }
    }
  }
}

const Canvas = styled.div`
  flex-grow: 1;

  display: flex;
  flex-direction: column;
  flex-wrap: nowrap;
  align-items: stretch;
  height: 100%;
  position: relative;
  overflow-x: hidden;
`;
