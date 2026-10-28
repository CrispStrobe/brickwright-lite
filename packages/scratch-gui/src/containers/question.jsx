import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import QuestionComponent from '../components/question/question.jsx';

class Question extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleChange',
            'handleKeyPress',
            'handleSubmit'
        ]);
        this.state = {
            answer: ''
        };
    }
    handleChange (e) {
        let answer = e.target.value;
        const prompt = this.props.arcadePrompt;
        if (prompt) {
            // The Arcade system keyboard limits the raw input before number cleanup.
            answer = answer.slice(0, prompt.answerLength);
            if (prompt.numbersOnly) {
                let cleaned = '';
                for (const character of answer) {
                    if (character === '-') {
                        if (cleaned.length !== 0) continue;
                    } else if (character === '.') {
                        if (cleaned.includes('.')) continue;
                    } else if (!/[0-9]/.test(character)) {
                        continue;
                    }
                    cleaned += character;
                }
                answer = cleaned;
            }
        }
        this.setState({answer});
    }
    handleKeyPress (event) {
        if (event.key === 'Enter') this.handleSubmit();
    }
    handleSubmit () {
        this.props.onQuestionAnswered(this.state.answer);
    }
    render () {
        return (
            <QuestionComponent
                answer={this.state.answer}
                question={this.props.question}
                arcadePrompt={this.props.arcadePrompt}
                onChange={this.handleChange}
                onClick={this.handleSubmit}
                onKeyPress={this.handleKeyPress}
            />
        );
    }
}

Question.propTypes = {
    onQuestionAnswered: PropTypes.func.isRequired,
    arcadePrompt: PropTypes.shape({
        answerLength: PropTypes.number.isRequired,
        numbersOnly: PropTypes.bool.isRequired
    }),
    question: PropTypes.string
};

export default Question;
