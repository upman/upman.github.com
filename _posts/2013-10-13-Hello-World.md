---
layout: post
description: An introduction of sorts.
tags: [Introduction, Hello-world, brainfuck]
comments: true
image:
      feature: aloha.jpg
---

A personal 'tech/whatever I want to post' blog has been on my mind for quite a while now.
A Place where I can share my random adventures with code, the web and anything interesting
under the sun and hopefully learn more from random strangers who might stumble upon my posts. Checkout the [about](/about) page for more about me and the blog.

So let me start off with a 'Hello world' as is customary, you know, to please the programming gods.

{% highlight brainfuck lineno %}
++++++++++ 
[>++++++++++>+++++++++++>++++++++++++>+++<<<<-]
>++++. 
---.   
>--..  
+++.   
>>++.  
<-.    
<.     
+++.   
------.
<-.
{% endhighlight %}

No, I'm not a troll. It's a proper program written in 'brainfuck'. I happened to stumble upon this
extremely minimalistic language a few days ago. I have to say it has a befitting name. So let's look at how exactly the program works (I'll try not to get into too much detail)

The basic Idea is, a character array of however long(Interpreter specific) is allocated and a pointer points to the first character at the start of execution of any brainfuck program.
Then, there are 8 operators in brainfuck.

|Operator | Description                            |
|:--------|:---------------------------------------|
| **+**     | Increment the value **at** the pointer |
| **-**     | Decrement the value **at** the pointer   |
| **<**     | Decrement pointer                      |
| **>**     | Increment pointer                      |
| **.**     | Display the character at pointer       |
| **,**     | Read a value and store it as the value at the pointer|
| **[**     | Start loop. Control enters into the segment that follows only if the value at pointer is non-zero. (Aha! if statement.)|
| **]**     | End loop. Control goes back to the corresponding '[' only if the value at the pointer is non-zero.|



Now it's hopefully clear how it works.
With the help of an [ASCII table](http://www.asciichart.com/) of course.

{% highlight brainfuck lineno %}
++++++++++   	       
[>++++++++++>	|A table of the ASCII values 
+++++++++++>	|in the array
++++++++++++>   |(at every line)
+++<<<<-]
		|100 110 120 30
>++++. 	   	|104 110 120 30 
---.       	|101 110 120 30
>--..      	|101 108 120 30
+++.       	|101 111 120 30
>>++.      	|101 111 120 32
<-.        	|101 111 119 32
<.         	|101 111 119 32
+++.       	|101 114 119 32
------.    	|101 108 119 32
<-.        	|100 108 119 32 
{% endhighlight %}

Okay, so that about wraps up the whole language.
How often does that happen? Somebody tricking you into learning a programming language?
So why is it so interesting? Well, the language is [turing complete](http://en.wikipedia.org/wiki/Turing-complete) which means that any
computation that can be simulated on a [turing machine](http://en.wikipedia.org/wiki/Turing_machine), (which is almost every algorithm) can be
programmed with brainfuck! [It's an esoteric language](http://esolangs.org/wiki/Esoteric_programming_language) largely implemented for shits and giggles, and
as an article of amusement for programmers. It's [almost](http://code.google.com/p/awib/) never used to write anything more than small code snippets. 

Here's an [online interpreter](http://esoteric.sange.fi/brainfuck/impl/interp/i.html) for you to try out brainfuck and here's a load of [brainfuck algorithms](http://esolangs.org/wiki/Brainfuck_algorithms) to get your head spinning.

