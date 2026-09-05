import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import bindAll from 'lodash.bindall';
import {FormattedMessage} from 'react-intl';

import styles from './monitor.css';
import List from 'react-virtualized/dist/es/List';

class ListMonitorScrollerBody extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['rowRenderer', 'noRowsRenderer', 'handleEventFactory']);
    }
    handleEventFactory (index) {
        return () => this.props.onActivate(index);
    }
    noRowsRenderer () {
        return (
            <div className={classNames(styles.listRow, styles.listEmpty)}>
                <FormattedMessage
                    defaultMessage="(empty)"
                    description="Text shown on a list monitor when a list is empty"
                    id="gui.monitor.listMonitor.empty"
                />
            </div>
        );
    }
    rowRenderer ({index, key, style}) {
        return (
            <div className={styles.listRow} data-list-index={index} key={key} style={style}>
                <div className={styles.listIndex}>{index + 1 /* one indexed */}</div>
                <div
                    className={styles.listValue}
                    dataIndex={index}
                    style={{
                        background: this.props.categoryColor.background,
                        color: this.props.categoryColor.text
                    }}
                    onClick={this.props.draggable ? this.handleEventFactory(index) : null}
                >
                    {this.props.draggable && this.props.activeIndex === index ? (
                        <div className={styles.inputWrapper}>
                            <input
                                autoFocus
                                autoComplete={false}
                                className={classNames(styles.listInput, 'no-drag')}
                                spellCheck={false}
                                style={{color: this.props.categoryColor.text}}
                                type="text"
                                value={this.props.activeValue}
                                onBlur={this.props.onDeactivate}
                                onChange={this.props.onInput}
                                onFocus={this.props.onFocus}
                                onKeyDown={this.props.onKeyPress}
                            />
                            <div
                                className={styles.removeButton}
                                data-list-row-remove
                                onMouseDown={this.props.onRemove}
                            >
                                {'✖︎'}
                            </div>
                        </div>
                    ) : (
                        <div className={styles.valueInner}>{this.props.values[index]}</div>
                    )}
                </div>
            </div>
        );
    }
    render () {
        const {height, values, width, activeIndex, activeValue} = this.props;
        const scrollToIndex = activeIndex === null ? undefined : activeIndex; /* eslint-disable-line no-undefined */
        return (
            <div data-testid="list-monitor-scroll-body" style={{height: height - 44, width}}>
                <List
                    activeIndex={activeIndex}
                    activeValue={activeValue}
                    height={height - 44}
                    noRowsRenderer={this.noRowsRenderer}
                    rowCount={values.length}
                    rowHeight={24}
                    rowRenderer={this.rowRenderer}
                    scrollToIndex={scrollToIndex} /* eslint-disable-line no-undefined */
                    values={values}
                    width={width}
                />
            </div>
        );
    }
}

ListMonitorScrollerBody.propTypes = {
    activeIndex: PropTypes.number,
    activeValue: PropTypes.string,
    categoryColor: PropTypes.shape({background: PropTypes.string.isRequired, text: PropTypes.string.isRequired})
        .isRequired,
    draggable: PropTypes.bool,
    height: PropTypes.number,
    onActivate: PropTypes.func,
    onDeactivate: PropTypes.func,
    onFocus: PropTypes.func,
    onInput: PropTypes.func,
    onKeyPress: PropTypes.func,
    onRemove: PropTypes.func,
    values: PropTypes.arrayOf(PropTypes.oneOfType([PropTypes.string, PropTypes.number])),
    width: PropTypes.number
};
export default ListMonitorScrollerBody;
