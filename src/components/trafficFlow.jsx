'use strict';

import _ from 'lodash';
import { Alert } from 'react-bootstrap';
import React from 'react';
import TWEEN from '@tweenjs/tween.js'; // Start TWEEN updates for sparklines and loading screen fading out
import Vizceral from 'vizceral-react';
import 'vizceral-react/dist/vizceral.css';
import keypress from 'keypress.js';
import queryString from 'query-string';
import request from 'superagent';

import './trafficFlow.css';
import Breadcrumbs from './breadcrumbs';
import DisplayOptions from './displayOptions';
import PhysicsOptions from './physicsOptions';
import FilterControls from './filterControls';
import DetailsPanelConnection from './detailsPanelConnection';
import DetailsPanelNode from './detailsPanelNode';
import LoadingCover from './loadingCover';
import Locator from './locator';
import OptionsPanel from './optionsPanel';
import UpdateStatus from './updateStatus';

import filterActions from './filterActions';
import filterStore from './filterStore';
import styled from 'styled-components';

const Box = styled.div`
  position: absolute;
  bottom: 10px;
  left: 10px;
  width: 200px;
  padding: 10px;
  /* height: 500px; */
  background: black;
  color: grey;
  border: 1px dashed white;
`;

const EdgeDataList = styled.div``;

const TARGETS = ["edge#1", "edge#2", "edge#3", "edge#4"];
const VIZ_DEF_CONFIG = {
  renderer: "global",
  name: "edge",
  maxVolume: 1000,
  nodes: [
    {
      renderer: "region",
      name: "INTERNET",
      class: "normal"
    },
    {
      renderer: "region",
      name: "edge#1",
      class: "normal",
      updated: 1466838546805
    },
    {
      renderer: "region",
      name: "edge#2",
      class: "normal",
      updated: 1466838546805
    },
    {
      renderer: "region",
      name: "edge#3",
      class: "normal",
      updated: 1466838546805
    },
    {
      renderer: "region",
      name: "edge#4",
      class: "normal",
      updated: 1466838546805
    }
  ]     
}
const getRandom = maxValue => {
  return Math.floor(Math.random() * maxValue)
}

const listener = new keypress.Listener();

const hasOwnPropFunc = Object.prototype.hasOwnProperty;

function animate (time) {
  requestAnimationFrame(animate);
  TWEEN.update(time);
}
requestAnimationFrame(animate);

const panelWidth = 400;

const arraySet = (array, index, element) =>{
  const newArray = [...array];
  newArray[index] = element;
  return newArray;
}
const objectSet = (obj, key, value) => {
  const newObj = {...obj};
  newObj[key] = value;
  return newObj;
}

class TrafficFlow extends React.Component {
  constructor (props) {
    super(props);

    this.state = {
      currentView: undefined,
      redirectedFrom: undefined,
      selectedChart: undefined,
      displayOptions: {
        allowDraggingOfNodes: false,
        showLabels: true
      },
      currentGraph_physicsOptions: {
        isEnabled: true,
        viscousDragCoefficient: 0.2,
        hooksSprings: {
          restLength: 50,
          springConstant: 0.2,
          dampingConstant: 0.1
        },
        particles: {
          mass: 1
        }
      },
      labelDimensions: {},
      appliedFilters: filterStore.getChangedFilters(),
      filters: filterStore.getFiltersArray(),
      searchTerm: '',
      matches: {
        total: -1,
        visible: -1
      },
      trafficData: {
        nodes: [],
        connections: []
      },
      regionUpdateStatus: [],
      timeOffset: 0,
      modes: {
        detailedNode: 'volume'
      },
      currentNormal: 0,
      currentDanger: 0,
      currentScale: 1000,
      maxVolume: 1000,
      autoChecked: true,
      autoTimer: null,
      currentEdge: 'edge#1'
    };

    // Browser history support
    window.addEventListener('popstate', event => this.handlePopState(event.state));

    // Keyboard interactivity
    listener.simple_combo('esc', () => {
      if (this.state.detailedNode) {
        this.setState({ detailedNode: undefined });
      } else if (this.state.currentView.length > 0) {
        this.setState({ currentView: this.state.currentView.slice(0, -1) });
      }
    });
  }

  handlePopState () {
    const state = window.history.state || {};
    this.poppedState = true;
    this.setState({ currentView: state.selected, objectToHighlight: state.highlighted });
  }

  viewChanged = (data) => {
    const changedState = {
      currentView: data.view,
      searchTerm: '',
      matches: { total: -1, visible: -1 },
      redirectedFrom: data.redirectedFrom
    };
    if (hasOwnPropFunc.call(data, 'graph')) {
      let oldCurrentGraph = this.state.currentGraph;
      if (oldCurrentGraph == null) oldCurrentGraph = null;
      let newCurrentGraph = data.graph;
      if (newCurrentGraph == null) newCurrentGraph = null;
      if (oldCurrentGraph !== newCurrentGraph) {
        changedState.currentGraph = newCurrentGraph;
        const o = newCurrentGraph === null ? null : newCurrentGraph.getPhysicsOptions();
        changedState.currentGraph_physicsOptions = o;
      }
    }
    this.setState(changedState);
  }

  viewUpdated = () => {
    this.setState({});
  }

  objectHighlighted = (highlightedObject) => {
    // need to set objectToHighlight for diffing on the react component. since it was already highlighted here, it will be a noop
    this.setState({
      highlightedObject: highlightedObject, objectToHighlight: highlightedObject ? highlightedObject.getName() : undefined, searchTerm: '', matches: { total: -1, visible: -1 }, redirectedFrom: undefined
    });
  }

  nodeContextSizeChanged = (dimensions) => {
    this.setState({ labelDimensions: dimensions });
  }

  checkInitialRoute () {
    // Check the location bar for any direct routing information
    const pathArray = window.location.pathname.split('/');
    const currentView = [];
    if (pathArray[1]) {
      currentView.push(pathArray[1]);
      if (pathArray[2]) {
        currentView.push(pathArray[2]);
      }
    }
    const parsedQuery = queryString.parse(window.location.search);

    this.setState({ currentView: currentView, objectToHighlight: parsedQuery.highlighted });
  }

  beginSampleData (data) {
    // this.traffic = { nodes: [], connections: [] };
    request.get('sample_data_simple.json')
    // request.get('sample_data_none.json')
    // request.get('sample_data_region_only.json')
      .set('Accept', 'application/json')
      .end((err, res) => {
        if (res && res.status === 200) {
          // this.traffic.clientUpdateTime = Date.now();
          res.body.connections[0].metrics = {
            normal:parseFloat(getRandom(1000)),
            danger:parseFloat(getRandom(10))
          }
          console.log(res.body)
          // this.setState({
          //   trafficData: res.body
          // })
          this.updateData(res.body);
        }
      });
  }

  updateRandomData = (newEdgeData) => {
    // const newEdegData = this.genConnectionData();
    this.refreshConnectionData(newEdgeData)
  };

  componentDidMount () {
    this.checkInitialRoute();
    this.beginSampleData({});

    // Listen for changes to the stores
    filterStore.addChangeListener(this.filtersChanged);
    let timer = null;
    if (this.state.autoChecked) {
      timer = setInterval(() => {
        const newEdgeData = this.genConnectionData();
        this.updateRandomData(newEdgeData);
      }, 3000);
    }; 
    this.setState({
      autoTimer: timer
    })
  }

  genConnectionData = (node, metrics) => {
    // const randomEdge = TARGETS[getRandom(4)];
    const edge = node || TARGETS[getRandom(4)];
    const newMetrics = metrics || {
      normal: parseFloat(getRandom(5000)),
      warning: parseFloat(getRandom(100)),
      danger: parseFloat(getRandom(50))
    }
    return {
      source: "INTERNET",
      target: edge,
      updated: Date.now(),
      notices: [],
      metrics: newMetrics,
      class: 'normal'
    }
  };

  componentWillUnmount () {
    filterStore.removeChangeListener(this.filtersChanged);
  }

  shouldComponentUpdate (nextProps, nextState) {
    console.log('nextState:', nextState)
    if (!this.state.currentView
        || this.state.currentView[0] !== nextState.currentView[0]
        || this.state.currentView[1] !== nextState.currentView[1]
        || this.state.highlightedObject !== nextState.highlightedObject) {
      const titleArray = (nextState.currentView || []).slice(0);
      titleArray.unshift('Vizceral');
      document.title = titleArray.join(' / ');

      if (this.poppedState) {
        this.poppedState = false;
      } else if (nextState.currentView) {
        const highlightedObjectName = nextState.highlightedObject && nextState.highlightedObject.getName();
        const state = {
          title: document.title,
          url: `/${nextState.currentView.join('/')}${highlightedObjectName ? `?highlighted=${highlightedObjectName}` : ''}`,
          selected: nextState.currentView,
          highlighted: highlightedObjectName
        };
        window.history.pushState(state, state.title, state.url);
      }
    }
    console.log('#### re-render')
    return true;
  }

  updateData (newTraffic) {
    const regionUpdateStatus = _.map(_.filter(newTraffic.nodes, n => n.name !== 'INTERNET'), node => ({ region: node.name, updated: node.updated }));
    const lastUpdatedTime = _.max(_.map(regionUpdateStatus, 'updated'));
    console.log('newTraffic in updateData:', newTraffic)
    this.setState({
      regionUpdateStatus: regionUpdateStatus,
      timeOffset: newTraffic.clientUpdateTime - newTraffic.serverUpdateTime,
      lastUpdatedTime: lastUpdatedTime,
      trafficData: newTraffic
    });
  }

  zoomCallback = () => {
    const newState = {
      currentView: this.state.currentView.slice()
    };

    if (this.state.highlightedObject) {
      // zooming in
      newState.currentView.push(this.state.highlightedObject.name);
      newState.objectToHighlight = undefined;
    } else if (newState.currentView.length > 0) {
      // zooming out
      const nodeName = newState.currentView.pop();
      newState.objectToHighlight = nodeName;
    }

    this.setState(newState);
  }

  displayOptionsChanged = (options) => {
    const displayOptions = _.merge({}, this.state.displayOptions, options);
    this.setState({ displayOptions: displayOptions });
  }

  physicsOptionsChanged = (physicsOptions) => {
    this.setState({ currentGraph_physicsOptions: physicsOptions });
    let { currentGraph } = this.state;
    if (currentGraph == null) currentGraph = null;
    if (currentGraph !== null) {
      currentGraph.setPhysicsOptions(physicsOptions);
    }
  }

  navigationCallback = (newNavigationState) => {
    this.setState({ currentView: newNavigationState });
  }

  detailsClosed = () => {
    const { currentGraph, currentView } = this.state;
    const newState = {};
    // If the current graph type is a focused graph
    if (currentGraph.type === 'focused') {
      // If there is a parent graph, navigate to parent view.
      if (currentGraph.parentGraph) {
        if (currentView.length > 0) {
          const newView = Array.from(currentView);
          newView.pop();
          newState.currentView = newView;
        }
        // If there is a parent graph that is _not_ a focused graph, close the panel
        if (currentGraph.parentGraph.type !== 'focused') {
          newState.focusedNode = undefined;
          newState.highlightedObject = undefined;
        }
      }
    } else {
      newState.focusedNode = undefined;
      newState.highlightedObject = undefined;
    }

    this.setState(newState);
  }

  filtersChanged = () => {
    this.setState({
      appliedFilters: filterStore.getChangedFilters(),
      filters: filterStore.getFiltersArray()
    });
  }

  filtersCleared = () => {
    if (!filterStore.isClear()) {
      if (!filterStore.isDefault()) {
        filterActions.resetFilters();
      } else {
        filterActions.clearFilters();
      }
    }
  }

  locatorChanged = (value) => {
    this.setState({ searchTerm: value });
  }

  matchesFound = (matches) => {
    this.setState({ matches: matches });
  }

  nodeClicked = (node) => {
    if (this.state.currentView.length === 1) {
      // highlight node
      this.setState({ objectToHighlight: node.getName() });
    } else if (this.state.currentView.length === 2) {
      // detailed view of node
      this.setState({ currentView: [this.state.currentView[0], node.getName()] });
    }
  }

  resetLayoutButtonClicked = () => {
    const g = this.state.currentGraph;
    if (g != null) {
      g._relayout();
    }
  }

  dismissAlert = () => {
    this.setState({ redirectedFrom: undefined });
  }

  refreshConnectionData = (connectionData) => {
    const oldConnectionData = this.state.trafficData.connections;
    const index = oldConnectionData.findIndex(data => data.target === connectionData.target);
    const newConnectionData = arraySet(oldConnectionData, index ,connectionData);
    console.log('new connection data =', connectionData, newConnectionData);
    const newTrafficData = {
      // ...this.state.trafficData,
      ...VIZ_DEF_CONFIG,
      maxVolume: this.state.maxVolume,
      clientUpdateTime: Date.now(),
      connections: newConnectionData
    }
    this.updateData(newTrafficData);
  };

  onChangeInput = (event) => {
    const type = event.target.id;
    console.log(type, event.target.value);
    this.setState({
      ...this.state,
      [type]: event.target.value
    }) 
  }

  onChangeCheckBox = (event) => {
    const autoChecked = event.target.checked;
    let timer = null;
    if(autoChecked){
      timer = setInterval(() => {
        const newEdgeData = this.genConnectionData();
        this.updateRandomData(newEdgeData);
      },3000)
    } else {
      clearInterval(this.state.autoTimer);
    }
    this.setState({
      autoChecked,
      autoTimer: timer
    })
  }

  onChangeSelect = (event) => {
    console.log(event.target.value);
    this.setState({
      currentEdge: event.target.value
    })
  }

  onChangeEdgeData = (event) => {
    const {currentEdge, trafficData} = this.state;
    const metricType = event.target.id;
    const metricValue = parseFloat(event.target.value);
    console.log(metricType, metricValue, currentEdge, trafficData.connections);
    const selectedEdgeConnection = trafficData.connections.find(connection => connection.target === currentEdge);
    const newMetrics = objectSet(selectedEdgeConnection.metrics, metricType, metricValue);
    console.log(newMetrics)
    const newConnectionData = this.genConnectionData(currentEdge, newMetrics);
    this.refreshConnectionData(newConnectionData);
  }

  render () {
    const { trafficData, currentEdge } = this.state;
    const focusedNode = this.state.currentGraph && this.state.currentGraph.focusedNode;
    const nodeToShowDetails = focusedNode || (this.state.highlightedObject && this.state.highlightedObject.type === 'node' ? this.state.highlightedObject : undefined);
    const connectionToShowDetails = this.state.highlightedObject && this.state.highlightedObject.type === 'connection' ? this.state.highlightedObject : undefined;
    const showLoadingCover = !this.state.currentGraph;
    const showBreadcrumbs = trafficData && trafficData.nodes && trafficData.nodes.length > 0;
    const breadcrumbsRoot = _.get(trafficData, 'name', 'root');
    const selectedEdgeConnection = trafficData.connections.find(connection => connection.target === currentEdge);
    const {normal, danger, warning} = selectedEdgeConnection ? selectedEdgeConnection.metrics: {};

    let matches;
    if (this.state.currentGraph) {
      matches = {
        totalMatches: this.state.matches.total,
        visibleMatches: this.state.matches.visible,
        total: this.state.currentGraph.nodeCounts.total,
        visible: this.state.currentGraph.nodeCounts.visible
      };
    }

    return (
      <div className="vizceral-container">
        { this.state.redirectedFrom
          ? <Alert onDismiss={this.dismissAlert}>
            <strong>{this.state.redirectedFrom.join('/') || '/'}</strong> does not exist, you were redirected to <strong>{this.state.currentView.join('/') || '/'}</strong> instead
          </Alert>
          : undefined }
        <div className="subheader">
          {showBreadcrumbs && <Breadcrumbs rootTitle={breadcrumbsRoot} navigationStack={this.state.currentView || []} navigationCallback={this.navigationCallback} />}
          {showBreadcrumbs && <UpdateStatus status={this.state.regionUpdateStatus} baseOffset={this.state.timeOffset} warnThreshold={180000} />}
          <div style={{ float: 'right', paddingTop: '4px' }}>
            {/* { (!focusedNode && matches) && <Locator changeCallback={this.locatorChanged} searchTerm={this.state.searchTerm} matches={matches} clearFilterCallback={this.filtersCleared} /> } */}
            <OptionsPanel title="Filters"><FilterControls /></OptionsPanel>
            <OptionsPanel title="Display"><DisplayOptions options={this.state.displayOptions} changedCallback={this.displayOptionsChanged} /></OptionsPanel>
            <OptionsPanel title="Physics"><PhysicsOptions options={this.state.currentGraph_physicsOptions} changedCallback={this.physicsOptionsChanged}/></OptionsPanel>
            <a role="button" className="reset-layout-link" onClick={this.resetLayoutButtonClicked}>Reset Layout</a>
          </div>
        </div>
        <div className="service-traffic-map">
          <div style={{
            position: 'absolute', top: '0px', right: nodeToShowDetails || connectionToShowDetails ? '380px' : '0px', bottom: '0px', left: '0px'
          }}>
            <Vizceral traffic={trafficData}
              view={this.state.currentView}
              showLabels={this.state.displayOptions.showLabels}
              filters={this.state.filters}
              viewChanged={this.viewChanged}
              viewUpdated={this.viewUpdated}
              objectHighlighted={this.objectHighlighted}
              nodeContextSizeChanged={this.nodeContextSizeChanged}
              objectToHighlight={this.state.objectToHighlight}
              matchesFound={this.matchesFound}
              match={this.state.searchTerm}
              modes={this.state.modes}
              allowDraggingOfNodes={this.state.displayOptions.allowDraggingOfNodes}
            />
          </div>
          {
            !!nodeToShowDetails
            && <DetailsPanelNode node={nodeToShowDetails}
              region={this.state.currentView[0]}
              width={panelWidth}
              zoomCallback={this.zoomCallback}
              closeCallback={this.detailsClosed}
              nodeClicked={node => this.nodeClicked(node)}
            />
          }
          {
            !!connectionToShowDetails
            && <DetailsPanelConnection connection={connectionToShowDetails}
              region={this.state.currentView[0]}
              width={panelWidth}
              closeCallback={this.detailsClosed}
              nodeClicked={node => this.nodeClicked(node)}
            />
          }
          <LoadingCover show={showLoadingCover} />
        </div>

        <Box>
          <input type='checkbox' checked={this.state.autoChecked} onChange={this.onChangeCheckBox}></input>
          <label> auto update(random)</label>
          <hr></hr>
          <label>maxVolume</label>
          <input id="maxVolume" value={this.state.maxVolume} onChange={this.onChangeInput}></input>
          <button onClick={this.updateRandomData}>apply</button>
          <hr></hr>
          <label>choose edge</label>
          <select value={this.state.currentEdge} onChange={this.onChangeSelect}>
            {this.state.trafficData.connections.map(connection => (
              <option value={connection.target}>{connection.target}</option>
            ))}
          </select>
          <EdgeDataList>
              <label>normal</label>
              <input id="normal" value={normal} onChange={this.onChangeEdgeData}></input>
              <label>warning</label>
              <input id="warning" value={warning} onChange={this.onChangeEdgeData}></input>
              <label>danger</label>
              <input id="danger" value={danger} onChange={this.onChangeEdgeData}></input>
          </EdgeDataList>
        </Box>
      </div>
    );
  }
}

TrafficFlow.propTypes = {
};

export default TrafficFlow;
